export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_usage: {
        Row: {
          business_id: string
          manila_date: string
          model: string | null
          outcomes: Json
          provider: string | null
          request_count: number
        }
        Insert: {
          business_id: string
          manila_date: string
          model?: string | null
          outcomes?: Json
          provider?: string | null
          request_count?: number
        }
        Update: {
          business_id?: string
          manila_date?: string
          model?: string | null
          outcomes?: Json
          provider?: string | null
          request_count?: number
        }
        Relationships: [
          {
            foreignKeyName: "ai_usage_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      audit_events: {
        Row: {
          actor_id: string | null
          business_id: string
          change: Json
          created_at: string
          entity_id: string
          entity_kind: string
          id: number
          reason: string | null
        }
        Insert: {
          actor_id?: string | null
          business_id: string
          change: Json
          created_at?: string
          entity_id: string
          entity_kind: string
          id?: never
          reason?: string | null
        }
        Update: {
          actor_id?: string | null
          business_id?: string
          change?: Json
          created_at?: string
          entity_id?: string
          entity_kind?: string
          id?: never
          reason?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "audit_events_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      automation_runs: {
        Row: {
          business_id: string
          error_code: string | null
          finished_at: string | null
          run_id: string
          started_at: string
          status: string
        }
        Insert: {
          business_id: string
          error_code?: string | null
          finished_at?: string | null
          run_id: string
          started_at?: string
          status: string
        }
        Update: {
          business_id?: string
          error_code?: string | null
          finished_at?: string | null
          run_id?: string
          started_at?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "automation_runs_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      businesses: {
        Row: {
          ai_daily_limit: number
          created_at: string
          currency: string
          demo_reference_date: string | null
          id: string
          is_demo: boolean
          name: string
          opening_cash_cents: number
          opening_date: string
          opening_locked_at: string | null
          revision: number
        }
        Insert: {
          ai_daily_limit?: number
          created_at?: string
          currency?: string
          demo_reference_date?: string | null
          id?: string
          is_demo?: boolean
          name: string
          opening_cash_cents: number
          opening_date: string
          opening_locked_at?: string | null
          revision?: number
        }
        Update: {
          ai_daily_limit?: number
          created_at?: string
          currency?: string
          demo_reference_date?: string | null
          id?: string
          is_demo?: boolean
          name?: string
          opening_cash_cents?: number
          opening_date?: string
          opening_locked_at?: string | null
          revision?: number
        }
        Relationships: []
      }
      cash_movements: {
        Row: {
          amount_cents: number
          business_id: string
          created_at: string
          effects: Json
          expense_id: string | null
          id: string
          invoice_id: string | null
          kind: string
          payment_date: string
          recorded_by: string
          reference: string | null
          request_id: string
          void_reason: string | null
          voided_at: string | null
          voided_by: string | null
        }
        Insert: {
          amount_cents: number
          business_id: string
          created_at?: string
          effects?: Json
          expense_id?: string | null
          id?: string
          invoice_id?: string | null
          kind: string
          payment_date: string
          recorded_by: string
          reference?: string | null
          request_id: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Update: {
          amount_cents?: number
          business_id?: string
          created_at?: string
          effects?: Json
          expense_id?: string | null
          id?: string
          invoice_id?: string | null
          kind?: string
          payment_date?: string
          recorded_by?: string
          reference?: string | null
          request_id?: string
          void_reason?: string | null
          voided_at?: string | null
          voided_by?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cash_movements_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cash_movements_expense_id_business_id_fkey"
            columns: ["expense_id", "business_id"]
            isOneToOne: false
            referencedRelation: "expenses"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "cash_movements_invoice_id_business_id_fkey"
            columns: ["invoice_id", "business_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      command_receipts: {
        Row: {
          business_id: string
          created_at: string
          payload_digest: string
          request_id: string
          result: Json
        }
        Insert: {
          business_id: string
          created_at?: string
          payload_digest: string
          request_id: string
          result: Json
        }
        Update: {
          business_id?: string
          created_at?: string
          payload_digest?: string
          request_id?: string
          result?: Json
        }
        Relationships: [
          {
            foreignKeyName: "command_receipts_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          business_id: string
          contact_name: string
          created_at: string
          email: string | null
          id: string
          name: string
          phone: string | null
          updated_at: string
          version: number
        }
        Insert: {
          business_id: string
          contact_name: string
          created_at?: string
          email?: string | null
          id?: string
          name: string
          phone?: string | null
          updated_at?: string
          version?: number
        }
        Update: {
          business_id?: string
          contact_name?: string
          created_at?: string
          email?: string | null
          id?: string
          name?: string
          phone?: string | null
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "customers_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      expectations: {
        Row: {
          amount_cents: number
          business_id: string
          confirmed_at: string
          confirmed_by: string
          expected_date: string
          id: string
          invoice_id: string
          kind: string
          remaining_cents: number
          source_note: string
          state: string
          version: number
        }
        Insert: {
          amount_cents: number
          business_id: string
          confirmed_at?: string
          confirmed_by: string
          expected_date: string
          id?: string
          invoice_id: string
          kind: string
          remaining_cents: number
          source_note: string
          state?: string
          version?: number
        }
        Update: {
          amount_cents?: number
          business_id?: string
          confirmed_at?: string
          confirmed_by?: string
          expected_date?: string
          id?: string
          invoice_id?: string
          kind?: string
          remaining_cents?: number
          source_note?: string
          state?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "expectations_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expectations_invoice_id_business_id_fkey"
            columns: ["invoice_id", "business_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount_cents: number
          business_id: string
          created_at: string
          due_date: string
          id: string
          label: string
          payee: string
          updated_at: string
          version: number
        }
        Insert: {
          amount_cents: number
          business_id: string
          created_at?: string
          due_date: string
          id?: string
          label: string
          payee: string
          updated_at?: string
          version?: number
        }
        Update: {
          amount_cents?: number
          business_id?: string
          created_at?: string
          due_date?: string
          id?: string
          label?: string
          payee?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "expenses_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      followups: {
        Row: {
          assignee_id: string
          automatic_type: string | null
          business_id: string
          completed_at: string | null
          completion_source: string | null
          correction_movement_id: string | null
          created_at: string
          due_date: string
          expectation_id: string | null
          id: string
          invoice_id: string
          next_action: string
          next_date: string | null
          outcome: string | null
          resolved_by_movement_id: string | null
          state: string
          updated_at: string
          version: number
        }
        Insert: {
          assignee_id: string
          automatic_type?: string | null
          business_id: string
          completed_at?: string | null
          completion_source?: string | null
          correction_movement_id?: string | null
          created_at?: string
          due_date: string
          expectation_id?: string | null
          id?: string
          invoice_id: string
          next_action: string
          next_date?: string | null
          outcome?: string | null
          resolved_by_movement_id?: string | null
          state?: string
          updated_at?: string
          version?: number
        }
        Update: {
          assignee_id?: string
          automatic_type?: string | null
          business_id?: string
          completed_at?: string | null
          completion_source?: string | null
          correction_movement_id?: string | null
          created_at?: string
          due_date?: string
          expectation_id?: string | null
          id?: string
          invoice_id?: string
          next_action?: string
          next_date?: string | null
          outcome?: string | null
          resolved_by_movement_id?: string | null
          state?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "followups_business_id_assignee_id_fkey"
            columns: ["business_id", "assignee_id"]
            isOneToOne: false
            referencedRelation: "memberships"
            referencedColumns: ["business_id", "user_id"]
          },
          {
            foreignKeyName: "followups_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "followups_correction_movement_id_business_id_fkey"
            columns: ["correction_movement_id", "business_id"]
            isOneToOne: false
            referencedRelation: "cash_movements"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "followups_expectation_id_business_id_fkey"
            columns: ["expectation_id", "business_id"]
            isOneToOne: false
            referencedRelation: "expectations"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "followups_invoice_id_business_id_fkey"
            columns: ["invoice_id", "business_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "business_id"]
          },
          {
            foreignKeyName: "followups_resolved_by_movement_id_business_id_fkey"
            columns: ["resolved_by_movement_id", "business_id"]
            isOneToOne: false
            referencedRelation: "cash_movements"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      invoices: {
        Row: {
          amount_cents: number
          business_id: string
          created_at: string
          customer_id: string
          due_date: string
          id: string
          number: string
          updated_at: string
          version: number
        }
        Insert: {
          amount_cents: number
          business_id: string
          created_at?: string
          customer_id: string
          due_date: string
          id?: string
          number: string
          updated_at?: string
          version?: number
        }
        Update: {
          amount_cents?: number
          business_id?: string
          created_at?: string
          customer_id?: string
          due_date?: string
          id?: string
          number?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoices_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_customer_id_business_id_fkey"
            columns: ["customer_id", "business_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
      memberships: {
        Row: {
          business_id: string
          display_name: string
          role: string
          user_id: string
        }
        Insert: {
          business_id: string
          display_name: string
          role: string
          user_id: string
        }
        Update: {
          business_id?: string
          display_name?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "memberships_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
        ]
      }
      reminders: {
        Row: {
          approval_basis: Json | null
          body: string
          business_id: string
          created_at: string
          id: string
          invoice_id: string
          recipient: string
          rejection_reason: string | null
          reported_channel: string | null
          reported_sent_at: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          state: string
          updated_at: string
          version: number
        }
        Insert: {
          approval_basis?: Json | null
          body: string
          business_id: string
          created_at?: string
          id?: string
          invoice_id: string
          recipient: string
          rejection_reason?: string | null
          reported_channel?: string | null
          reported_sent_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: string
          updated_at?: string
          version?: number
        }
        Update: {
          approval_basis?: Json | null
          body?: string
          business_id?: string
          created_at?: string
          id?: string
          invoice_id?: string
          recipient?: string
          rejection_reason?: string | null
          reported_channel?: string | null
          reported_sent_at?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: string
          updated_at?: string
          version?: number
        }
        Relationships: [
          {
            foreignKeyName: "reminders_business_id_fkey"
            columns: ["business_id"]
            isOneToOne: false
            referencedRelation: "businesses"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "reminders_invoice_id_business_id_fkey"
            columns: ["invoice_id", "business_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["id", "business_id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      workspace_command: { Args: { p_command: Json }; Returns: Json }
      workspace_history: {
        Args: { p_cursor?: string; p_id: string; p_kind: string }
        Returns: Json
      }
      workspace_snapshot: { Args: never; Returns: Json }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const

