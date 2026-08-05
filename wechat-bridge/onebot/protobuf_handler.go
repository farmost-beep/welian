package main

import (
	"encoding/json"
	"fmt"
	"strings"
	"time"

	wxproto "github.com/farmost-beep/welian/wechat-bridge/onebot/proto"
	"google.golang.org/protobuf/encoding/protowire"
	"google.golang.org/protobuf/proto"
)

// HandleProtobufMsgAndSend 处理 Frida 发来的 protobuf 消息并转发
func HandleProtobufMsgAndSend(payload map[string]interface{}) {
	jsonList, err := HandleProtobufMsg(payload)
	if err != nil {
		Error("protobuf消息处理失败", "err", err)
		return
	}
	for _, jsonData := range jsonList {
		if jsonData != nil {
			SendHttpReq(jsonData)
		}
	}
}

// HandleProtobufMsg 解析 protobuf 消息
func HandleProtobufMsg(payload map[string]interface{}) ([][]byte, error) {
	dataInter, ok := payload["data"]
	if !ok {
		return nil, fmt.Errorf("protobuf_msg: missing data field")
	}
	dataArr, ok := dataInter.([]interface{})
	if !ok {
		return nil, fmt.Errorf("protobuf_msg: data is not array")
	}

	rawBytes := make([]byte, len(dataArr))
	for i, v := range dataArr {
		num, ok := v.(float64)
		if !ok {
			return nil, fmt.Errorf("protobuf_msg: data[%d] is not number", i)
		}
		rawBytes[i] = byte(int(num))
	}

	dataList := parseAllRecvData(rawBytes)
	if len(dataList) == 0 {
		return nil, fmt.Errorf("protobuf_msg: cannot extract message data")
	}

	var jsonList [][]byte
	for _, data := range dataList {
		jsonData, err := buildWechatMessageJSON(data)
		if err != nil {
			continue
		}
		if jsonData != nil {
			jsonList = append(jsonList, jsonData)
		}
	}

	if len(jsonList) == 0 {
		return nil, fmt.Errorf("protobuf_msg: no messages found")
	}
	return jsonList, nil
}

// parseAllRecvData 从原始字节提取所有消息
func parseAllRecvData(rawBytes []byte) []*wxproto.WxRecvMsgData {
	var result []*wxproto.WxRecvMsgData
	for _, wrapperRaw := range consumeBytesFields(rawBytes, 2) {
		for _, bodyRaw := range consumeBytesFields(wrapperRaw, 2) {
			body := &wxproto.WxRecvMsgBody{}
			if err := proto.Unmarshal(bodyRaw, body); err != nil {
				continue
			}
			if body.Content != nil && body.Content.Data != nil {
				result = append(result, body.Content.Data)
			}
		}
	}
	return result
}

func consumeBytesFields(raw []byte, field protowire.Number) [][]byte {
	var out [][]byte
	for len(raw) > 0 {
		num, typ, n := protowire.ConsumeTag(raw)
		if n < 0 {
			break
		}
		raw = raw[n:]
		if typ == protowire.BytesType {
			v, m := protowire.ConsumeBytes(raw)
			if m < 0 {
				break
			}
			if num == field {
				out = append(out, v)
			}
			raw = raw[m:]
			continue
		}
		m := protowire.ConsumeFieldValue(num, typ, raw)
		if m < 0 {
			break
		}
		raw = raw[m:]
	}
	return out
}

// buildWechatMessageJSON 把 protobuf 消息转成 OneBot JSON
func buildWechatMessageJSON(data *wxproto.WxRecvMsgData) ([]byte, error) {
	sender := ""
	receiver := ""
	content := ""
	if data.Sender != nil {
		sender = data.Sender.Value
	}
	if data.Receiver != nil {
		receiver = data.Receiver.Value
	}
	if data.Content != nil {
		content = data.Content.Value
	}
	xmlStr := string(data.Xml)
	userContent := string(data.UserContent)
	msgId := fmt.Sprintf("%d", data.MsgId)

	if sender == "" || receiver == "" || content == "" || msgId == "" || msgId == "0" {
		return nil, fmt.Errorf("missing required fields")
	}

	selfId := receiver
	msgType := "private"
	groupId := ""
	senderUser := sender
	senderNickname := ""

	// 只处理文本消息
	messages := getMessagesFromProto(content, sender)
	if len(messages) == 0 {
		return nil, fmt.Errorf("no messages")
	}

	if strings.Contains(sender, "@chatroom") {
		msgType = "group"
		groupId = sender
		splitIndex := strings.Index(content, ":")
		sendUserStart := strings.Index(content, "wxid_")
		if sendUserStart >= 0 && splitIndex > sendUserStart {
			senderUser = strings.TrimSpace(content[sendUserStart:splitIndex])
		}
		// 提取昵称
		splitIdx := strings.Index(userContent, ":")
		if splitIdx == -1 {
			if idx := strings.Index(userContent, "在群聊中@了你"); idx != -1 {
				senderNickname = strings.TrimSpace(userContent[:idx])
			} else if idx := strings.Index(userContent, "在群聊中发了一段语"); idx != -1 {
				senderNickname = strings.TrimSpace(userContent[:idx])
			}
		} else {
			senderNickname = strings.TrimSpace(userContent[:splitIdx])
		}
		if senderNickname == "" {
			senderNickname = senderUser
		}
	} else {
		splitIdx := strings.Index(userContent, ":")
		if splitIdx != -1 {
			senderNickname = strings.TrimSpace(userContent[:splitIdx])
		}
		if senderNickname == "" {
			senderNickname = senderUser
		}
	}

	if groupId != "" {
		userID2NicknameMap.Store(groupId+"_"+senderUser, senderNickname)
	}

	wechatMsg := &WechatMessage{
		GroupId:     groupId,
		SelfID:      selfId,
		UserID:      senderUser,
		Sender:      &Sender{UserID: senderUser, Nickname: senderNickname},
		Time:        time.Now().UnixMilli(),
		PostType:    "message",
		MessageId:   msgId,
		Message:     messages,
		MsgResource: xmlStr,
		RawMessage:  content,
		ShowContent: userContent,
		MessageType: msgType,
	}

	return json.Marshal(wechatMsg)
}

func getMessagesFromProto(content, sender string) []*Message {
	var messages []*Message
	if strings.Contains(sender, "@chatroom") {
		splitIndex := strings.Index(content, ":")
		pureContent := ""
		if splitIndex >= 0 {
			pureContent = strings.TrimSpace(content[splitIndex+1:])
		} else {
			pureContent = content
		}
		parts := strings.Split(pureContent, "\u2005")
		for _, part := range parts {
			part = strings.TrimSpace(part)
			if part == "" {
				continue
			}
			messages = append(messages, &Message{Type: "text", Data: &SendRequestData{Text: part}})
		}
	} else {
		messages = append(messages, &Message{Type: "text", Data: &SendRequestData{Text: content}})
	}
	return messages
}

// buildTextMsgProtobuf 构造发送文本消息的 protobuf
func buildTextMsgProtobuf(receiver, content, atUser string) ([]byte, error) {
	msg := &wxproto.WxSendTextMsg{
		Type: 1,
		Body: &wxproto.WxSendTextBody{
			Receiver:  &wxproto.WxString{Value: receiver},
			Content:   []byte(content),
			Flag:      1,
			Timestamp: time.Now().Unix(),
			MsgId:     int64(NextVersion()),
		},
	}
	return proto.Marshal(msg)
}
