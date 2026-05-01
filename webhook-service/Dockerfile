FROM golang:1.26.2-alpine3.22 AS build

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . ./
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/webhook-service ./cmd/webhook-service

FROM alpine:3.22

RUN addgroup -S modularis && adduser -S modularis -G modularis
USER modularis

COPY --from=build /out/webhook-service /usr/local/bin/webhook-service

EXPOSE 8081

ENTRYPOINT ["/usr/local/bin/webhook-service"]
