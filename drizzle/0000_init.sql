CREATE TABLE "ai_costs" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"workflow_execution_id" varchar(255),
	"model" varchar(100) NOT NULL,
	"tokens_input" integer NOT NULL,
	"tokens_output" integer NOT NULL,
	"cost_usd" numeric(10, 6) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "credential_usage_log" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255),
	"service" varchar(50) NOT NULL,
	"action" varchar(50) NOT NULL,
	"ip_address" varchar(50),
	"user_agent" text,
	"success" boolean DEFAULT true NOT NULL,
	"error_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "metrics" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"metric_type" varchar(100) NOT NULL,
	"value" numeric NOT NULL,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "user_credentials" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"service" varchar(50) NOT NULL,
	"auth_type" varchar(20) NOT NULL,
	"api_key_encrypted" text,
	"access_token" text,
	"refresh_token" text,
	"token_expires_at" timestamp with time zone,
	"scope" text,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_credentials_user_id_service_unique" UNIQUE("user_id","service")
);
--> statement-breakpoint
CREATE TABLE "user_sessions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"user_id" varchar(255) NOT NULL,
	"session_token" varchar(512) NOT NULL,
	"refresh_token" varchar(512),
	"ip_address" varchar(50),
	"user_agent" text,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_activity" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "user_sessions_session_token_unique" UNIQUE("session_token"),
	CONSTRAINT "user_sessions_refresh_token_unique" UNIQUE("refresh_token")
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"google_id" varchar(255) NOT NULL,
	"email" varchar(255) NOT NULL,
	"name" varchar(255),
	"picture" text,
	"workspace_domain" varchar(255),
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_login" timestamp with time zone,
	CONSTRAINT "users_google_id_unique" UNIQUE("google_id"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "webhook_events" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"source" varchar(50) NOT NULL,
	"event_type" varchar(100) NOT NULL,
	"payload" jsonb NOT NULL,
	"processed" boolean DEFAULT false NOT NULL,
	"workflow_execution_id" varchar(255),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "workflow_executions" (
	"id" varchar(255) PRIMARY KEY NOT NULL,
	"type" varchar(50) NOT NULL,
	"status" varchar(50) NOT NULL,
	"input" jsonb NOT NULL,
	"output" jsonb,
	"error" text,
	"ai_model" varchar(100),
	"tokens_input" integer,
	"tokens_output" integer,
	"cost_usd" numeric(10, 6),
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"completed_at" timestamp with time zone,
	"duration" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"user_id" varchar(255)
);
--> statement-breakpoint
CREATE INDEX "idx_ai_costs_workflow_id" ON "ai_costs" USING btree ("workflow_execution_id");--> statement-breakpoint
CREATE INDEX "idx_ai_costs_model" ON "ai_costs" USING btree ("model");--> statement-breakpoint
CREATE INDEX "idx_ai_costs_created_at" ON "ai_costs" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_credential_usage_log_user_id" ON "credential_usage_log" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_credential_usage_log_service" ON "credential_usage_log" USING btree ("service");--> statement-breakpoint
CREATE INDEX "idx_credential_usage_log_action" ON "credential_usage_log" USING btree ("action");--> statement-breakpoint
CREATE INDEX "idx_credential_usage_log_created_at" ON "credential_usage_log" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_metrics_type" ON "metrics" USING btree ("metric_type");--> statement-breakpoint
CREATE INDEX "idx_metrics_created_at" ON "metrics" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_user_credentials_user_id" ON "user_credentials" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_credentials_service" ON "user_credentials" USING btree ("service");--> statement-breakpoint
CREATE INDEX "idx_user_credentials_auth_type" ON "user_credentials" USING btree ("auth_type");--> statement-breakpoint
CREATE INDEX "idx_user_sessions_user_id" ON "user_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "idx_user_sessions_session_token" ON "user_sessions" USING btree ("session_token");--> statement-breakpoint
CREATE INDEX "idx_user_sessions_expires_at" ON "user_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE INDEX "idx_users_google_id" ON "users" USING btree ("google_id");--> statement-breakpoint
CREATE INDEX "idx_users_email" ON "users" USING btree ("email");--> statement-breakpoint
CREATE INDEX "idx_users_workspace_domain" ON "users" USING btree ("workspace_domain");--> statement-breakpoint
CREATE INDEX "idx_webhook_events_source" ON "webhook_events" USING btree ("source");--> statement-breakpoint
CREATE INDEX "idx_webhook_events_processed" ON "webhook_events" USING btree ("processed");--> statement-breakpoint
CREATE INDEX "idx_webhook_events_created_at" ON "webhook_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "idx_workflow_executions_type" ON "workflow_executions" USING btree ("type");--> statement-breakpoint
CREATE INDEX "idx_workflow_executions_status" ON "workflow_executions" USING btree ("status");--> statement-breakpoint
CREATE INDEX "idx_workflow_executions_started_at" ON "workflow_executions" USING btree ("started_at");--> statement-breakpoint
CREATE INDEX "idx_workflow_executions_user_id" ON "workflow_executions" USING btree ("user_id");