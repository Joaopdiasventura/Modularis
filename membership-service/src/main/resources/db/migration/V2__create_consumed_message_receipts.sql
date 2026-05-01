create table consumed_message_receipts (
    message_id varchar(64) primary key,
    consumer_name varchar(120) not null,
    event_type varchar(120) not null,
    correlation_id varchar(64) not null,
    processed_at timestamptz not null default timezone('utc', now())
);
