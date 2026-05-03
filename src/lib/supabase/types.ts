export type Database = {
  __InternalSupabase: {
    PostgrestVersion: "12";
  };
  public: {
    Tables: {
      profiles: {
        Row: {
          id: string;
          display_name: string | null;
          created_at: string;
        };
        Insert: {
          id: string;
          display_name?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          display_name?: string | null;
        };
        Relationships: [];
      };
      share_groups: {
        Row: {
          id: string;
          name: string;
          owner_id: string;
          principal: number;
          frequency: "weekly" | "biweekly" | "monthly";
          total_rounds: number;
          start_date: string;
          bid_mode: "auction" | "queue";
          dealer_fee: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          owner_id: string;
          principal: number;
          frequency: "weekly" | "biweekly" | "monthly";
          total_rounds: number;
          start_date: string;
          bid_mode: "auction" | "queue";
          dealer_fee?: number;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["share_groups"]["Insert"]>;
        Relationships: [];
      };
      memberships: {
        Row: {
          id: string;
          group_id: string;
          user_id: string | null;
          display_name: string;
          role: "owner" | "member";
          queue_position: number | null;
          joined_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          user_id?: string | null;
          display_name: string;
          role?: "owner" | "member";
          queue_position?: number | null;
          joined_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["memberships"]["Insert"]>;
        Relationships: [];
      };
      rounds: {
        Row: {
          id: string;
          group_id: string;
          round_number: number;
          due_date: string;
          winner_membership_id: string | null;
          bid_amount: number;
          status: "pending" | "completed";
          notes: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          group_id: string;
          round_number: number;
          due_date: string;
          winner_membership_id?: string | null;
          bid_amount?: number;
          status?: "pending" | "completed";
          notes?: string | null;
          created_at?: string;
        };
        Update: Partial<Database["public"]["Tables"]["rounds"]["Insert"]>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
    Enums: Record<string, never>;
    CompositeTypes: Record<string, never>;
  };
};
