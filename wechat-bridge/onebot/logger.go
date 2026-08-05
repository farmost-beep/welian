package main

import (
	"fmt"
	"log"
	"os"
	"strings"
)

var logLevel = "info"

func initLogger() {
	log.SetFlags(log.Ltime | log.Lshortfile)
}

func SetLogLevel(level string) {
	logLevel = strings.ToLower(level)
}

func shouldLog(level string) bool {
	levels := map[string]int{"debug": 0, "info": 1, "warn": 2, "error": 3}
	return levels[strings.ToLower(level)] >= levels[logLevel]
}

func Info(msg string, fields ...any) {
	if !shouldLog("info") {
		return
	}
	logWithFields("INFO", msg, fields...)
}

func Warn(msg string, fields ...any) {
	if !shouldLog("warn") {
		return
	}
	logWithFields("WARN", msg, fields...)
}

func Error(msg string, fields ...any) {
	if !shouldLog("error") {
		return
	}
	logWithFields("ERROR", msg, fields...)
}

func Fatal(msg string, fields ...any) {
	logWithFields("FATAL", msg, fields...)
	os.Exit(1)
}

func logWithFields(level, msg string, fields ...any) {
	if len(fields) == 0 {
		log.Printf("[%s] %s", level, msg)
		return
	}
	parts := []string{fmt.Sprintf("[%s] %s", level, msg)}
	for i := 0; i+1 < len(fields); i += 2 {
		parts = append(parts, fmt.Sprintf("%v=%v", fields[i], fields[i+1]))
	}
	log.Println(strings.Join(parts, " "))
}
