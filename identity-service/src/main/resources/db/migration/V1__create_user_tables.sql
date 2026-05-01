create table users (
    id uuid primary key,
    email varchar(255) not null unique,
    name varchar(120) not null,
    cellphone varchar(40) not null,
    tax_id varchar(32) not null unique,
    is_premium boolean not null default false,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create table onboarding_requests (
    idempotency_key varchar(128) primary key,
    request_hash varchar(128) not null,
    correlation_id varchar(64) not null,
    user_id uuid not null references users(id),
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create table user_compensation_receipts (
    idempotency_key varchar(128) primary key,
    correlation_id varchar(64) not null,
    user_id uuid not null,
    created_at timestamptz not null,
    updated_at timestamptz not null
);

create table outbox_events (
    id uuid primary key,
    routing_key varchar(128) not null,
    correlation_id varchar(64) not null,
    causation_id varchar(64),
    payload_json text not null,
    status varchar(16) not null,
    attempts integer not null default 0,
    next_attempt_at timestamptz not null,
    created_at timestamptz not null,
    published_at timestamptz
);

create index outbox_events_status_idx on outbox_events (status, next_attempt_at);
