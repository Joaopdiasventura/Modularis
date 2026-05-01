FROM golang:1.26.2-alpine3.22 AS build

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/payment-service ./cmd/payment-service

FROM alpine:3.22

RUN addgroup -S modularis && adduser -S modularis -G modularis
USER modularis

COPY --from=build /out/payment-service /usr/local/bin/payment-service

EXPOSE 8080

ENTRYPOINT ["/usr/local/bin/payment-service"]
