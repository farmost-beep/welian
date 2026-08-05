package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync/atomic"
	"time"
)

// sendGroupHandler 处理 /send_group_msg 和 /send_private_msg
func sendGroupHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		http.Error(w, "仅支持 POST", http.StatusMethodNotAllowed)
		return
	}

	req := new(SendRequest)
	if err := json.NewDecoder(r.Body).Decode(req); err != nil {
		http.Error(w, "无效的 JSON", http.StatusBadRequest)
		return
	}

	if len(req.Message) == 0 || (req.UserID == "" && req.GroupID == "") {
		http.Error(w, "参数缺失", http.StatusBadRequest)
		return
	}

	// 只处理文本消息
	sendContent := ""
	atUserID := ""
	for _, v := range req.Message {
		if v.Type == "text" {
			sendContent += v.Data.Text
		} else if v.Type == "at" {
			if req.GroupID != "" {
				if nickname, ok := userID2NicknameMap.Load(req.GroupID + "_" + v.Data.QQ); ok {
					sendContent += fmt.Sprintf("@%s\u2005", nickname.(string))
				}
				atUserID += v.Data.QQ + ","
			}
		}
	}

	if sendContent == "" {
		http.Error(w, "仅支持文本消息", http.StatusBadRequest)
		return
	}

	ch := make(chan error, 1)
	msgChan <- &SendMsg{
		UserId:     req.UserID,
		GroupID:    req.GroupID,
		Content:    sendContent,
		Type:       "text",
		AtUser:     strings.TrimRight(atUserID, ","),
		ResultChan: ch,
	}

	if err := <-ch; err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusInternalServerError)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "failed",
			"error":  err.Error(),
		})
		return
	}

	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "ok",
	})
}

// SendWorker 从 msgChan 取消息，通过 Frida 发送
func SendWorker() {
	for msg := range msgChan {
		err := sendTextViaFrida(msg)
		if msg.ResultChan != nil {
			msg.ResultChan <- err
		}
	}
}

// sendTextViaFrida 通过 Frida 脚本发送文本消息
func sendTextViaFrida(msg *SendMsg) error {
	if fridaScript == nil {
		return fmt.Errorf("frida 脚本未加载")
	}

	target := msg.GroupID
	if target == "" {
		target = msg.UserId
	}

	// 构造 protobuf 消息
	pbData, err := buildTextMsgProtobuf(target, msg.Content, msg.AtUser)
	if err != nil {
		return fmt.Errorf("构造 protobuf 失败: %w", err)
	}

	hexData := bytesToHex(pbData)
	taskId := NextVersion()

	// 通过 Frida script.Post 发送指令
	// script.js 中的 triggerSendTextMessage 函数会处理实际发送
	postData := map[string]interface{}{
		"type":     "send_text",
		"task_id":  taskId,
		"receiver": target,
		"content":  msg.Content,
		"hex_data": hexData,
		"at_user":  msg.AtUser,
	}
	postBytes, _ := json.Marshal(postData)
	fridaScript.Post(string(postBytes), nil)

	atomicAddTaskId()
	return nil
}

// SendHttpReq 把收到的消息转发到 Bridge
func SendHttpReq(jsonData []byte) {
	time.Sleep(time.Duration(config.SendInterval) * time.Millisecond)

	jsonReq, err := HandleMsg(jsonData)
	if err != nil {
		Error("JSON 序列化失败", "err", err)
		return
	}
	if jsonReq == nil {
		return
	}

	Info("转发消息到 Bridge", "msg", string(jsonReq)[:min(200, len(string(jsonReq)))])

	req, err := http.NewRequest("POST", config.SendURL, bytes.NewBuffer(jsonReq))
	if err != nil {
		Error("创建请求失败", "err", err)
		return
	}

	// HMAC 签名
	h := hmac.New(sha1.New, []byte(config.OnebotToken))
	h.Write(jsonReq)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Signature", "sha1="+hex.EncodeToString(h.Sum(nil)))

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		Error("请求 Bridge 失败", "err", err)
		return
	}
	defer resp.Body.Close()

	body, _ := io.ReadAll(resp.Body)
	Info("Bridge 响应", "status", resp.StatusCode, "body", string(body)[:min(200, len(string(body)))])
}

// HandleMsg 把 protobuf 解析结果转成 OneBot JSON
func HandleMsg(rawMsg []byte) ([]byte, error) {
	// rawMsg 已经是 WechatMessage JSON，直接透传
	return rawMsg, nil
}

// statusHandler 已在 main.go 中定义

// --- helpers ---

func bytesToHex(b []byte) string {
	hex := make([]byte, len(b)*2)
	const hexChars = "0123456789abcdef"
	for i, v := range b {
		hex[i*2] = hexChars[v>>4]
		hex[i*2+1] = hexChars[v&0xf]
	}
	return string(hex)
}

func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

func atomicAddTaskId() {
	atomic.AddInt64(&taskId, 1)
}
