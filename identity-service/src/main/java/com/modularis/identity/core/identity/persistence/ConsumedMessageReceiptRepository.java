package com.modularis.identity.core.identity.persistence;

import com.modularis.identity.core.identity.domain.ConsumedMessageReceiptEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ConsumedMessageReceiptRepository extends JpaRepository<ConsumedMessageReceiptEntity, String> {
}
