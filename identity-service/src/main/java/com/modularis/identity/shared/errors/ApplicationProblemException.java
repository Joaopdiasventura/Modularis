package com.modularis.identity.shared.errors;

public class ApplicationProblemException extends RuntimeException {
	private final int status;
	private final String title;
	private final String detail;
	private final String code;

	public ApplicationProblemException(int status, String title, String detail, String code) {
		super(detail);
		this.status = status;
		this.title = title;
		this.detail = detail;
		this.code = code;
	}

	public int getStatus() {
		return status;
	}

	public String getTitle() {
		return title;
	}

	public String getDetail() {
		return detail;
	}

	public String getCode() {
		return code;
	}
}
