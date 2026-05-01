package com.modularis.membership.core.membership.messaging;

import com.modularis.membership.core.membership.application.MembershipApplicationService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.amqp.ImmediateRequeueAmqpException;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

@Component
public class PaymentEventListener {
	private static final Logger LOGGER = LoggerFactory.getLogger(PaymentEventListener.class);

	private final MembershipApplicationService membershipApplicationService;

	public PaymentEventListener(MembershipApplicationService membershipApplicationService) {
		this.membershipApplicationService = membershipApplicationService;
	}

	@RabbitListener(queues = "#{@paymentConfirmedQueue.name}")
	public void onPaymentConfirmed(PaymentConfirmedEventMessage event) {
		try {
			LOGGER.info("Consuming async event type={} correlationId={}", event.type(), event.correlationId());
			membershipApplicationService.handlePaymentConfirmed(event);
		} catch (RuntimeException ex) {
			LOGGER.error("Failed to process payment.confirmed event {}", event.messageId(), ex);
			throw new ImmediateRequeueAmqpException("retry payment.confirmed");
		}
	}
}
