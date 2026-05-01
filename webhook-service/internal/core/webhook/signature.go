package webhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"strconv"
	"strings"
	"time"
)

var (
	ErrMissingSignatureHeader = errors.New("missing signature header")
	ErrInvalidSignatureFormat = errors.New("invalid signature header format")
	ErrExpiredSignature       = errors.New("signature timestamp is outside the allowed tolerance")
	ErrInvalidSignature       = errors.New("signature mismatch")
)

func Validate(secret string, headerValue string, body []byte, now time.Time, tolerance time.Duration) error {
	timestamp, providedSignature, err := parseHeader(headerValue)
	if err != nil {
		return err
	}
	if absDuration(now.Sub(timestamp)) > tolerance {
		return ErrExpiredSignature
	}

	expectedSignature := Sign(secret, timestamp, body)
	if !hmac.Equal([]byte(expectedSignature), []byte(providedSignature)) {
		return ErrInvalidSignature
	}
	return nil
}

func BuildHeader(secret string, timestamp time.Time, body []byte) string {
	return fmt.Sprintf("t=%d,v1=%s", timestamp.Unix(), Sign(secret, timestamp, body))
}

func Sign(secret string, timestamp time.Time, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(strconv.FormatInt(timestamp.Unix(), 10)))
	mac.Write([]byte("."))
	mac.Write(body)
	return hex.EncodeToString(mac.Sum(nil))
}

func parseHeader(value string) (time.Time, string, error) {
	if strings.TrimSpace(value) == "" {
		return time.Time{}, "", ErrMissingSignatureHeader
	}

	var rawTimestamp string
	var signature string
	for _, part := range strings.Split(value, ",") {
		keyValue := strings.SplitN(strings.TrimSpace(part), "=", 2)
		if len(keyValue) != 2 {
			return time.Time{}, "", ErrInvalidSignatureFormat
		}
		switch keyValue[0] {
		case "t":
			rawTimestamp = keyValue[1]
		case "v1":
			signature = keyValue[1]
		}
	}
	if rawTimestamp == "" || signature == "" {
		return time.Time{}, "", ErrInvalidSignatureFormat
	}

	seconds, err := strconv.ParseInt(rawTimestamp, 10, 64)
	if err != nil {
		return time.Time{}, "", ErrInvalidSignatureFormat
	}
	return time.Unix(seconds, 0).UTC(), signature, nil
}

func absDuration(value time.Duration) time.Duration {
	if value < 0 {
		return -value
	}
	return value
}
