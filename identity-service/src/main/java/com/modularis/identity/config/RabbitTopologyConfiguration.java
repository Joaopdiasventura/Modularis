package com.modularis.identity.config;

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
	Queue userCreateQueue(ModularisProperties properties) {
		return QueueBuilder.durable(properties.queues().userCreate())
				.withArgument("x-queue-type", "quorum")
				.withArgument("x-delivery-limit", properties.rabbitmq().deliveryLimit())
				.deadLetterExchange("")
				.deadLetterRoutingKey(properties.queues().userCreate() + ".dlq")
				.build();
	}

	@Bean
	Queue userCreateDlq(ModularisProperties properties) {
		return QueueBuilder.durable(properties.queues().userCreate() + ".dlq")
				.withArgument("x-queue-type", "quorum")
				.build();
	}

	@Bean
	Binding userCreateBinding(Queue userCreateQueue, TopicExchange commandExchange) {
		return BindingBuilder.bind(userCreateQueue).to(commandExchange).with("identity.user.create");
	}

	@Bean
	Binding userCompensationBinding(Queue userCreateQueue, TopicExchange commandExchange) {
		return BindingBuilder.bind(userCreateQueue).to(commandExchange).with("identity.user.compensate");
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
