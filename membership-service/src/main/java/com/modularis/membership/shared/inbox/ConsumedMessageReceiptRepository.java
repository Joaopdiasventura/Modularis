package com.modularis.membership.shared.inbox;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ConsumedMessageReceiptRepository extends JpaRepository<ConsumedMessageReceiptEntity, String> {
}
