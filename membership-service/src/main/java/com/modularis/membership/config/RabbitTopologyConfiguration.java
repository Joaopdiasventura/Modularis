package com.modularis.membership.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.json.JsonMapper;
import org.springframework.amqp.core.Binding;
import org.springframework.amqp.core.BindingBuilder;
import org.springframework.amqp.core.Queue;
import org.springframework.amqp.core.QueueBuilder;
import org.springframework.amqp.core.TopicExchange;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.JacksonJsonMessageConverter;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitTopologyConfiguration {

	@Bean
	ObjectMapper objectMapper() {
		return JsonMapper.builder()
				.findAndAddModules()
				.build();
	}

	@Bean
	TopicExchange commandExchange(ModularisProperties properties) {
		return new TopicExchange(properties.rabbitmq().commandExchange(), true, false);
	}

	@Bean
	TopicExchange eventExchange(ModularisProperties properties) {
		return new TopicExchange(properties.rabbitmq().eventExchange(), true, false);
	}

	@Bean
	TopicExchange responseExchange(ModularisProperties properties) {
		return new TopicExchange(properties.rabbitmq().responseExchange(), true, false);
	}

	@Bean
	Queue paymentConfirmedQueue(ModularisProperties properties) {
		return QueueBuilder.durable(properties.queues().paymentConfirmed())
				.withArgument("x-queue-type", "quorum")
				.withArgument("x-delivery-limit", properties.rabbitmq().deliveryLimit())
				.deadLetterExchange("")
				.deadLetterRoutingKey(properties.queues().paymentConfirmed() + ".dlq")
				.build();
	}

	@Bean
	Queue paymentConfirmedDlq(ModularisProperties properties) {
		return QueueBuilder.durable(properties.queues().paymentConfirmed() + ".dlq")
				.withArgument("x-queue-type", "quorum")
				.build();
	}

	@Bean
	Binding paymentConfirmedBinding(Queue paymentConfirmedQueue, TopicExchange eventExchange) {
		return BindingBuilder.bind(paymentConfirmedQueue).to(eventExchange).with("payment.confirmed");
	}

	@Bean
	JacksonJsonMessageConverter jacksonJsonMessageConverter() {
		return new JacksonJsonMessageConverter();
	}

	@Bean
	RabbitTemplate rabbitTemplate(
			ConnectionFactory connectionFactory,
			JacksonJsonMessageConverter converter
	) {
		var template = new RabbitTemplate(connectionFactory);
		template.setMessageConverter(converter);
		return template;
	}
}
