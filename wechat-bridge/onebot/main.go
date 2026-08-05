// Minimal OneBot server for Welian — group text messages only.
//
// Based on yincongcyincong/weixin-macos (GPL v3).
// Simplified to: text-only, group-only, HTTP-only.
//
// Usage:
//   ./onebot -wechat_pid=$(pgrep WeChat) -send_url=http://127.0.0.1:36100
//   ./onebot -type=gadget -gadget_addr=127.0.0.1:27042

package main

import (
	"bytes"
	"encoding/json"
	"flag"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"text/template"
	"time"

	"github.com/frida/frida-go/frida"
)

func main() {
	initFlag()
	initLogger()

	if config.FridaType == "gadget" {
		initFridaGadget()
	} else {
		initFrida()
	}

	go SendWorker()

	http.HandleFunc("/send_group_msg", sendGroupHandler)
	http.HandleFunc("/send_private_msg", sendGroupHandler) // same handler, routes by field
	http.HandleFunc("/get_status", statusHandler)

	stop := make(chan os.Signal, 1)
	signal.Notify(stop, os.Interrupt, syscall.SIGTERM)

	go func() {
		<-stop
		if fridaScript != nil {
			fridaScript.Clean()
		}
		if session != nil {
			session.Clean()
		}
		if device != nil {
			device.Clean()
		}
		Fatal("正在释放 Frida 资源并退出...")
	}()

	Info("HTTP 服务启动在", "host", config.ReceiveHost)
	if err := http.ListenAndServe(config.ReceiveHost, nil); err != nil {
		Fatal("服务启动失败", "err", err)
	}
}

func initFlag() {
	flag.StringVar(&config.FridaType, "type", "local", "frida 类型: local | gadget")
	flag.StringVar(&config.SendURL, "send_url", "http://127.0.0.1:36100/", "接收消息的 URL（Bridge 地址）")
	flag.StringVar(&config.ReceiveHost, "receive_host", "127.0.0.1:58080", "OneBot HTTP 监听地址")
	flag.StringVar(&config.FridaGadgetAddr, "gadget_addr", "127.0.0.1:27042", "Gadget 地址（type=gadget 时）")
	flag.StringVar(&config.OnebotToken, "token", "MuseBot", "OneBot Token")
	flag.StringVar(&config.ImagePath, "image_path", "", "图片路径（本最小版不用，保留兼容）")
	flag.StringVar(&config.WechatConf, "wechat_conf", "./wechat_version/4_1_11_53_mac.json", "微信版本偏移配置")
	flag.StringVar(&config.ConnType, "conn_type", "http", "连接类型: http")
	flag.IntVar(&config.SendInterval, "send_interval", 1000, "发送间隔 ms")
	flag.IntVar(&config.WechatPid, "wechat_pid", 0, "微信进程 PID，0=自动查找")
	flag.StringVar(&logLevel, "log_level", "info", "log level")
	flag.Parse()

	// 从 image_path 提取 wxid
	if myWechatId == "" && config.ImagePath != "" {
		if idx := strings.Index(config.ImagePath, "xwechat_files/"); idx != -1 {
			rest := config.ImagePath[idx+len("xwechat_files/"):]
			if end := strings.Index(rest, "/"); end != -1 {
				rest = rest[:end]
			}
			if last := strings.LastIndex(rest, "_"); last > strings.Index(rest, "_") {
				myWechatId = rest[:last]
			}
		}
	}

	fmt.Println("FridaType", config.FridaType)
	fmt.Println("SendURL", config.SendURL)
	fmt.Println("ReceiveHost", config.ReceiveHost)
	fmt.Println("WechatConf", config.WechatConf)
	fmt.Println("WechatPid", config.WechatPid)
}

func initFridaGadget() {
	var err error
	mgr := frida.NewDeviceManager()
	device, err = mgr.AddRemoteDevice(config.FridaGadgetAddr, frida.NewRemoteDeviceOptions())
	if err != nil {
		Fatal("无法连接 Gadget", "err", err)
	}
	session, err = device.Attach("Gadget", nil)
	if err != nil {
		Fatal("附加失败", "err", err)
	}
	loadJs()
}

func initFrida() {
	var err error
	mgr := frida.NewDeviceManager()
	device, err = mgr.DeviceByType(frida.DeviceTypeLocal)
	if err != nil {
		Fatal("无法获取本地设备", "err", err)
	}
	attachWechat()
}

func attachWechat() {
	var pid int
	var err error
	if config.WechatPid > 0 {
		pid = config.WechatPid
		Info("使用指定的微信进程 PID", "PID", pid)
	} else {
		for {
			pid, err = GetWeChatPID()
			if err == nil {
				break
			}
			Info("未发现正在运行的微信进程，20秒后重试...")
			time.Sleep(20 * time.Second)
		}
		Info("自动发现微信进程 PID", "PID", pid)
	}
	session, err = device.Attach(pid, nil)
	if err != nil {
		Error("Attach 失败 (请检查 SIP 状态或权限)", "err", err)
		Info("HTTP 服务将继续启动，但 Frida 功能不可用")
		return
	}
	Info("成功 Attach 微信进程", "PID", pid)
	loadJs()
}

func loadJs() {
	jsonData, err := os.ReadFile(config.WechatConf)
	if err != nil {
		Fatal("读取版本配置失败", "err", err)
	}
	var wechatHookConf map[string]interface{}
	if err = json.Unmarshal(jsonData, &wechatHookConf); err != nil {
		Fatal("解析 JSON 失败", "err", err)
	}
	codeTemplate, err := os.ReadFile("./script.js")
	if err != nil {
		Fatal("读取 script.js 失败", "err", err)
	}
	tmpl, err := template.New("fridaScript").Parse(string(codeTemplate))
	if err != nil {
		Fatal("解析模板失败", "err", err)
	}
	var buf bytes.Buffer
	if err = tmpl.Execute(&buf, wechatHookConf); err != nil {
		Fatal("执行模板失败", "err", err)
	}
	script, err := session.CreateScript(buf.String())
	if err != nil {
		Fatal("创建脚本失败", "err", err)
	}

	script.On("message", func(rawMsg string) {
		handleFridaMessage(rawMsg)
	})

	if err := script.Load(); err != nil {
		Fatal("加载脚本失败", "err", err)
	}
	fridaScript = script
	Info("✅ Frida 已就绪，微信控制通道已打通")
}

// handleFridaMessage 处理 Frida 脚本发来的消息
func handleFridaMessage(rawMsg string) {
	var msg map[string]interface{}
	if err := json.Unmarshal([]byte(rawMsg), &msg); err != nil {
		Error("JSON解析失败", "err", err)
		return
	}
	msgType, _ := msg["type"].(string)
	switch msgType {
	case "send":
		if p, ok := msg["payload"].(map[string]interface{}); ok {
			payloadJson, _ := json.Marshal(p)
			if t, ok := p["type"].(string); ok {
				switch t {
				case "protobuf_msg":
					go HandleProtobufMsgAndSend(p)
				case "send":
					go SendHttpReq(payloadJson)
				case "buf2resp":
					go handleBuf2Resp(p)
				}
			}
		}
	case "log":
		Info("[JS日志]", "payload", msg["payload"])
	case "error":
		Error("[JS报错]", "description", msg["description"], "stack", msg["stack"])
	}
}

// handleBuf2Resp 处理 buf2resp（发送消息后的回调）
func handleBuf2Resp(p map[string]interface{}) {
	// 最小版只记录日志，不做复杂处理
	Info("buf2resp 回调", "msg_type", p["msg_type"])
}

// GetWeChatPID 查找微信进程 PID
func GetWeChatPID() (int, error) {
	// 通过 pgrep 查找
	out, err := os.ReadFile("/tmp/.wechat_pid")
	if err == nil {
		var pid int
		fmt.Sscanf(string(out), "%d", &pid)
		if pid > 0 {
			return pid, nil
		}
	}
	// fallback: 用 ps
	return 0, fmt.Errorf("wechat process not found")
}

// statusHandler 健康检查
func statusHandler(w http.ResponseWriter, r *http.Request) {
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status":      "ok",
		"frida_ready": fridaScript != nil,
		"wechat_id":   myWechatId,
	})
}
