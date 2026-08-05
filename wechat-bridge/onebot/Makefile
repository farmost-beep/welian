.PHONY: proto build clean

PROTO_FILES = proto/wx_msg.proto proto/text_msg.proto

proto: $(PROTO_FILES)
	protoc --go_out=. --go_opt=module=github.com/farmost-beep/welian/wechat-bridge/onebot \
		--proto_path=proto \
		$(PROTO_FILES)

build: proto
	go build -o onebot .

clean:
	rm -f onebot proto/*.pb.go
