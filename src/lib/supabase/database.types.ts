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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      availability: {
        Row: {
          created_at: string
          day: string
          employee_id: string
          from_time: string | null
          id: number
          not_available: boolean
          to_time: string | null
        }
        Insert: {
          created_at?: string
          day: string
          employee_id: string
          from_time?: string | null
          id?: never
          not_available?: boolean
          to_time?: string | null
        }
        Update: {
          created_at?: string
          day?: string
          employee_id?: string
          from_time?: string | null
          id?: never
          not_available?: boolean
          to_time?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "availability_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      cash_counts: {
        Row: {
          amount: number
          breakdown: Json | null
          created_at: string
          day: string
          employee_id: string
          id: number
          kind: Database["public"]["Enums"]["cash_count_kind"]
        }
        Insert: {
          amount: number
          breakdown?: Json | null
          created_at?: string
          day?: string
          employee_id: string
          id?: never
          kind: Database["public"]["Enums"]["cash_count_kind"]
        }
        Update: {
          amount?: number
          breakdown?: Json | null
          created_at?: string
          day?: string
          employee_id?: string
          id?: never
          kind?: Database["public"]["Enums"]["cash_count_kind"]
        }
        Relationships: [
          {
            foreignKeyName: "cash_counts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employee_pins: {
        Row: {
          employee_id: string
          failed_attempts: number
          locked_until: string | null
          pin_hash: string
          updated_at: string
        }
        Insert: {
          employee_id: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash: string
          updated_at?: string
        }
        Update: {
          employee_id?: string
          failed_attempts?: number
          locked_until?: string | null
          pin_hash?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employee_pins_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: true
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      employees: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
        }
        Relationships: []
      }
      expenses: {
        Row: {
          amount: number
          created_at: string
          day: string
          employee_id: string
          id: number
          reason: string
        }
        Insert: {
          amount: number
          created_at?: string
          day?: string
          employee_id: string
          id?: never
          reason: string
        }
        Update: {
          amount?: number
          created_at?: string
          day?: string
          employee_id?: string
          id?: never
          reason?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      notification_settings: {
        Row: {
          alert: Database["public"]["Enums"]["notification_alert"]
          enabled: boolean
          owner_id: string
        }
        Insert: {
          alert: Database["public"]["Enums"]["notification_alert"]
          enabled?: boolean
          owner_id: string
        }
        Update: {
          alert?: Database["public"]["Enums"]["notification_alert"]
          enabled?: boolean
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "notification_settings_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      profiles: {
        Row: {
          created_at: string
          name: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          name: string
          role: Database["public"]["Enums"]["user_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          name?: string
          role?: Database["public"]["Enums"]["user_role"]
          user_id?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string
          endpoint: string
          id: string
          owner_id: string
          p256dh: string
          user_agent: string | null
        }
        Insert: {
          auth: string
          created_at?: string
          endpoint: string
          id?: string
          owner_id: string
          p256dh: string
          user_agent?: string | null
        }
        Update: {
          auth?: string
          created_at?: string
          endpoint?: string
          id?: string
          owner_id?: string
          p256dh?: string
          user_agent?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["user_id"]
          },
        ]
      }
      schedule_weeks: {
        Row: {
          published: boolean
          published_at: string | null
          week_start: string
        }
        Insert: {
          published?: boolean
          published_at?: string | null
          week_start: string
        }
        Update: {
          published?: boolean
          published_at?: string | null
          week_start?: string
        }
        Relationships: []
      }
      shifts: {
        Row: {
          created_at: string
          day: string
          employee_id: string
          from_time: string
          id: string
          to_time: string
        }
        Insert: {
          created_at?: string
          day: string
          employee_id: string
          from_time: string
          id?: string
          to_time: string
        }
        Update: {
          created_at?: string
          day?: string
          employee_id?: string
          from_time?: string
          id?: string
          to_time?: string
        }
        Relationships: [
          {
            foreignKeyName: "shifts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
        ]
      }
      stock_categories: {
        Row: {
          active: boolean
          created_at: string
          id: string
          name: string
          sort_order: number
        }
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          name: string
          sort_order?: number
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          name?: string
          sort_order?: number
        }
        Relationships: []
      }
      stock_changes: {
        Row: {
          amount: number
          created_at: string
          employee_id: string
          id: number
          item_id: string
          quantity_after: number
          quantity_before: number
        }
        Insert: {
          amount: number
          created_at?: string
          employee_id: string
          id?: never
          item_id: string
          quantity_after: number
          quantity_before: number
        }
        Update: {
          amount?: number
          created_at?: string
          employee_id?: string
          id?: never
          item_id?: string
          quantity_after?: number
          quantity_before?: number
        }
        Relationships: [
          {
            foreignKeyName: "stock_changes_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_changes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_items"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "stock_changes_item_id_fkey"
            columns: ["item_id"]
            isOneToOne: false
            referencedRelation: "stock_levels"
            referencedColumns: ["item_id"]
          },
        ]
      }
      stock_items: {
        Row: {
          active: boolean
          category_id: string
          created_at: string
          id: string
          low_stock_level: number
          name: string
          starting_quantity: number
          unit: string
        }
        Insert: {
          active?: boolean
          category_id: string
          created_at?: string
          id?: string
          low_stock_level?: number
          name: string
          starting_quantity?: number
          unit?: string
        }
        Update: {
          active?: boolean
          category_id?: string
          created_at?: string
          id?: string
          low_stock_level?: number
          name?: string
          starting_quantity?: number
          unit?: string
        }
        Relationships: [
          {
            foreignKeyName: "stock_items_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "stock_categories"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      stock_levels: {
        Row: {
          current_quantity: number | null
          is_low: boolean | null
          item_id: string | null
        }
        Relationships: []
      }
    }
    Functions: {
      adjust_stock: {
        Args: {
          p_amount: number
          p_employee_id: string
          p_item_id: string
          p_pin: string
        }
        Returns: Json
      }
      create_employee: {
        Args: { p_name: string; p_pin: string }
        Returns: string
      }
      employee_pin_status: {
        Args: never
        Returns: {
          employee_id: string
          has_pin: boolean
          locked_until: string
        }[]
      }
      get_counter_stock: {
        Args: never
        Returns: {
          category_id: string
          category_name: string
          category_sort: number
          current_quantity: number
          item_id: string
          item_name: string
          unit: string
        }[]
      }
      get_day_status: { Args: never; Returns: Json }
      log_cash_count: {
        Args: {
          p_breakdown: Json
          p_employee_id: string
          p_kind: Database["public"]["Enums"]["cash_count_kind"]
          p_pin: string
        }
        Returns: Json
      }
      log_expense: {
        Args: {
          p_amount: number
          p_employee_id: string
          p_pin: string
          p_reason: string
        }
        Returns: Json
      }
      set_employee_pin: {
        Args: { p_employee_id: string; p_new_pin: string }
        Returns: undefined
      }
      shop_today: { Args: never; Returns: string }
      unlock_employee: { Args: { p_employee_id: string }; Returns: undefined }
      verify_employee_pin: {
        Args: { p_employee_id: string; p_pin: string }
        Returns: Json
      }
    }
    Enums: {
      cash_count_kind: "opening" | "closing"
      notification_alert:
        | "low_stock"
        | "day_closed"
        | "expense_logged"
        | "availability_reminder"
      user_role: "owner" | "counter"
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
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {
      cash_count_kind: ["opening", "closing"],
      notification_alert: [
        "low_stock",
        "day_closed",
        "expense_logged",
        "availability_reminder",
      ],
      user_role: ["owner", "counter"],
    },
  },
} as const
