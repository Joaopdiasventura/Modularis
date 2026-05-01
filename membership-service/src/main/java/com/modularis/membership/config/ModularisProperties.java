package com.modularis.membership.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties(prefix = "modularis")
public record ModularisProperties(
		Rabbitmq rabbitmq,
		Outbox outbox,
		Queues queues
) {
	public record Rabbitmq(
			String commandExchange,
			String eventExchange,
			String responseExchange,
			int deliveryLimit
	) {
	}

	public record Outbox(
			String publishDelay,
			int maxBatchSize
	) {
	}

	public record Queues(
			String userCreate,
			String paymentConfirmed
	) {
	}
}
