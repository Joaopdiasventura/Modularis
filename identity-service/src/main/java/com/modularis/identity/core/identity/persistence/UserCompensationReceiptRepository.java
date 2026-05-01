package com.modularis.identity.core.identity.persistence;

import com.modularis.identity.core.identity.domain.UserCompensationReceiptEntity;
import org.springframework.data.jpa.repository.JpaRepository;

public interface UserCompensationReceiptRepository extends JpaRepository<UserCompensationReceiptEntity, String> {
}
