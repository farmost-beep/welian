package main

import (
	"math/rand"
	"sync"
	"sync/atomic"

	"github.com/frida/frida-go/frida"
)

// 全局变量
var (
	fridaScript *frida.Script
	session     *frida.Session
	device      frida.DeviceInt
	taskId      = int64(0x20000000)
	myWechatId  = ""

	globalSessionId   = uint32(rand.Int63n(4000000000) + 100000000)
	globalDeviceId    = rand.Uint64() | (0xFFFFFFFF << 32)
	globalClientProof = []byte("m64" + generateClientProof(13))

	msgChan = make(chan *SendMsg, 100)

	config = &Config{}

	userID2NicknameMap sync.Map
)

func generateClientProof(n int) string {
	const chars = "abcdefghijklmnopqrstuvwxyz0123456789"
	b := make([]byte, n)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

func NextVersion() uint32 {
	return uint32(atomic.LoadInt64(&taskId))
}

// WechatMessage OneBot 消息格式
type WechatMessage struct {
	GroupId     string     `json:"group_id"`
	SelfID      string     `json:"self_id"`
	UserID      string     `json:"user_id"`
	Sender      *Sender    `json:"sender"`
	Time        int64      `json:"time"`
	PostType    string     `json:"post_type"`
	MessageId   string     `json:"message_id"`
	Message     []*Message `json:"message"`
	MsgResource string     `json:"msgsource"`
	RawMessage  string     `json:"raw_message"`
	ShowContent string     `json:"show_content"`
	MessageType string     `json:"message_type"`
}

type Sender struct {
	UserID   string `json:"user_id"`
	Nickname string `json:"nickname"`
}

// SendMsg 内部发送消息结构
type SendMsg struct {
	UserId     string
	GroupID    string
	Content    string
	Type       string // text
	AtUser     string
	ResultChan chan error
}

// SendRequest HTTP 请求结构
type SendRequest struct {
	Message []*Message `json:"message"`
	UserID  string     `json:"user_id"`
	GroupID string     `json:"group_id"`
}

type Message struct {
	Type string           `json:"type"`
	Data *SendRequestData `json:"data"`
}

type SendRequestData struct {
	Text string `json:"text,omitempty"`
	QQ   string `json:"qq,omitempty"`
}

// Config 配置
type Config struct {
	FridaType       string
	SendURL         string
	ReceiveHost     string
	FridaGadgetAddr string
	OnebotToken     string
	ImagePath       string
	ConnType        string
	SendInterval    int
	WechatPid       int
	WechatConf      string
}
