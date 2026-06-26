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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      branches: {
        Row: {
          address: string | null
          bodega_display_name: string | null
          created_at: string
          driver_location_enabled: boolean
          id: string
          is_active: boolean
          is_bodega: boolean
          name: string
          phone: string | null
          preorder_enabled: boolean
          preorder_route_id: string | null
          require_dispatch_before_route: boolean
          updated_at: string
        }
        Insert: {
          address?: string | null
          bodega_display_name?: string | null
          created_at?: string
          driver_location_enabled?: boolean
          id?: string
          is_active?: boolean
          is_bodega?: boolean
          name: string
          phone?: string | null
          preorder_enabled?: boolean
          preorder_route_id?: string | null
          require_dispatch_before_route?: boolean
          updated_at?: string
        }
        Update: {
          address?: string | null
          bodega_display_name?: string | null
          created_at?: string
          driver_location_enabled?: boolean
          id?: string
          is_active?: boolean
          is_bodega?: boolean
          name?: string
          phone?: string | null
          preorder_enabled?: boolean
          preorder_route_id?: string | null
          require_dispatch_before_route?: boolean
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branches_preorder_route_id_fkey"
            columns: ["preorder_route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_supply_order_items: {
        Row: {
          correction_quantity: number | null
          created_at: string
          id: string
          order_id: string
          product_id: string
          quantity: number
          received_quantity: number | null
        }
        Insert: {
          correction_quantity?: number | null
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          quantity: number
          received_quantity?: number | null
        }
        Update: {
          correction_quantity?: number | null
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          received_quantity?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "branch_supply_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "branch_supply_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_supply_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      branch_supply_orders: {
        Row: {
          bodega_id: string
          branch_id: string
          branch_receipt_note: string | null
          branch_receipt_status: Database["public"]["Enums"]["branch_receipt_status"] | null
          correction_delivered_at: string | null
          correction_status: Database["public"]["Enums"]["supply_correction_status"] | null
          created_at: string
          delivery_date: string
          id: string
          notes: string | null
          order_source: string
          placed_at: string
          placed_by: string
          status: Database["public"]["Enums"]["supply_order_status"]
          updated_at: string
        }
        Insert: {
          bodega_id: string
          branch_id: string
          branch_receipt_note?: string | null
          branch_receipt_status?: Database["public"]["Enums"]["branch_receipt_status"] | null
          correction_delivered_at?: string | null
          correction_status?: Database["public"]["Enums"]["supply_correction_status"] | null
          created_at?: string
          delivery_date: string
          id?: string
          notes?: string | null
          order_source?: string
          placed_at?: string
          placed_by: string
          status?: Database["public"]["Enums"]["supply_order_status"]
          updated_at?: string
        }
        Update: {
          bodega_id?: string
          branch_id?: string
          branch_receipt_note?: string | null
          branch_receipt_status?: Database["public"]["Enums"]["branch_receipt_status"] | null
          correction_delivered_at?: string | null
          correction_status?: Database["public"]["Enums"]["supply_correction_status"] | null
          created_at?: string
          delivery_date?: string
          id?: string
          notes?: string | null
          order_source?: string
          placed_at?: string
          placed_by?: string
          status?: Database["public"]["Enums"]["supply_order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "branch_supply_orders_bodega_id_fkey"
            columns: ["bodega_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_supply_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "branch_supply_orders_placed_by_fkey"
            columns: ["placed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      cross_branch_load_items: {
        Row: {
          cross_branch_load_id: string
          id: string
          product_id: string
          quantity: number
        }
        Insert: {
          cross_branch_load_id: string
          id?: string
          product_id: string
          quantity: number
        }
        Update: {
          cross_branch_load_id?: string
          id?: string
          product_id?: string
          quantity?: number
        }
        Relationships: [
          {
            foreignKeyName: "cross_branch_load_items_cross_branch_load_id_fkey"
            columns: ["cross_branch_load_id"]
            isOneToOne: false
            referencedRelation: "cross_branch_loads"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "cross_branch_load_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      cross_branch_loads: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          driver_id: string
          id: string
          notes: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          driver_id: string
          id?: string
          notes?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          driver_id?: string
          id?: string
          notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "cross_branch_loads_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_import_batches: {
        Row: {
          branch_id: string
          created_at: string
          created_by: string | null
          id: string
          label: string | null
        }
        Insert: {
          branch_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
        }
        Update: {
          branch_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          label?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "customer_import_batches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_prices: {
        Row: {
          created_at: string
          customer_id: string
          price: number
          product_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          price: number
          product_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          price?: number
          product_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_prices_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_prices_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_order_items: {
        Row: {
          created_at: string
          id: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Insert: {
          created_at?: string
          id?: string
          order_id: string
          product_id: string
          quantity: number
          unit_price: number
        }
        Update: {
          created_at?: string
          id?: string
          order_id?: string
          product_id?: string
          quantity?: number
          unit_price?: number
        }
        Relationships: [
          {
            foreignKeyName: "customer_order_items_order_id_fkey"
            columns: ["order_id"]
            isOneToOne: false
            referencedRelation: "customer_orders"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_order_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_orders: {
        Row: {
          branch_id: string
          created_at: string
          customer_id: string
          delivery_date: string
          delivery_id: string | null
          id: string
          notes: string | null
          placed_at: string
          placed_by: string | null
          route_id: string
          status: Database["public"]["Enums"]["order_status"]
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          customer_id: string
          delivery_date: string
          delivery_id?: string | null
          id?: string
          notes?: string | null
          placed_at?: string
          placed_by?: string | null
          route_id: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          customer_id?: string
          delivery_date?: string
          delivery_id?: string | null
          id?: string
          notes?: string | null
          placed_at?: string
          placed_by?: string | null
          route_id?: string
          status?: Database["public"]["Enums"]["order_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_orders_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_orders_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_orders_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_orders_placed_by_fkey"
            columns: ["placed_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_orders_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          address: string | null
          branch_id: string
          category: Database["public"]["Enums"]["customer_category"]
          created_at: string
          id: string
          import_batch_id: string | null
          import_position: number | null
          is_active: boolean
          lat: number | null
          lng: number | null
          name: string
          notes: string | null
          pending_balance: number
          phone: string | null
          photo_url: string | null
          updated_at: string
        }
        Insert: {
          address?: string | null
          branch_id: string
          category?: Database["public"]["Enums"]["customer_category"]
          created_at?: string
          id?: string
          import_batch_id?: string | null
          import_position?: number | null
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name: string
          notes?: string | null
          pending_balance?: number
          phone?: string | null
          photo_url?: string | null
          updated_at?: string
        }
        Update: {
          address?: string | null
          branch_id?: string
          category?: Database["public"]["Enums"]["customer_category"]
          created_at?: string
          id?: string
          import_batch_id?: string | null
          import_position?: number | null
          is_active?: boolean
          lat?: number | null
          lng?: number | null
          name?: string
          notes?: string | null
          pending_balance?: number
          phone?: string | null
          photo_url?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customers_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customers_import_batch_id_fkey"
            columns: ["import_batch_id"]
            isOneToOne: false
            referencedRelation: "customer_import_batches"
            referencedColumns: ["id"]
          },
        ]
      }
      deliveries: {
        Row: {
          branch_id: string
          comment: string | null
          created_at: string
          customer_id: string
          delivery_date: string
          driver_id: string
          failure_photo_url: string | null
          failure_reason:
            | Database["public"]["Enums"]["delivery_failure_reason"]
            | null
          id: string
          photo_url: string | null
          route_id: string
          status: Database["public"]["Enums"]["delivery_status"]
          updated_at: string
        }
        Insert: {
          branch_id: string
          comment?: string | null
          created_at?: string
          customer_id: string
          delivery_date?: string
          driver_id: string
          failure_photo_url?: string | null
          failure_reason?:
            | Database["public"]["Enums"]["delivery_failure_reason"]
            | null
          id?: string
          photo_url?: string | null
          route_id: string
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Update: {
          branch_id?: string
          comment?: string | null
          created_at?: string
          customer_id?: string
          delivery_date?: string
          driver_id?: string
          failure_photo_url?: string | null
          failure_reason?:
            | Database["public"]["Enums"]["delivery_failure_reason"]
            | null
          id?: string
          photo_url?: string | null
          route_id?: string
          status?: Database["public"]["Enums"]["delivery_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "deliveries_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "deliveries_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_items: {
        Row: {
          created_at: string
          delivery_id: string
          id: string
          line_total: number | null
          product_id: string
          quantity: number
          unit_price: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_id: string
          id?: string
          line_total?: number | null
          product_id: string
          quantity: number
          unit_price: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_id?: string
          id?: string
          line_total?: number | null
          product_id?: string
          quantity?: number
          unit_price?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_items_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      delivery_returns: {
        Row: {
          created_at: string
          delivery_id: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          delivery_id: string
          id?: string
          product_id: string
          quantity: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          delivery_id?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "delivery_returns_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "delivery_returns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      dev_demo_entities: {
        Row: {
          created_at: string
          id: string
          record_id: string
          table_name: string
        }
        Insert: {
          created_at?: string
          id?: string
          record_id: string
          table_name: string
        }
        Update: {
          created_at?: string
          id?: string
          record_id?: string
          table_name?: string
        }
        Relationships: []
      }
      dispatch_items: {
        Row: {
          created_at: string
          dispatch_id: string
          id: string
          product_id: string
          quantity: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          dispatch_id: string
          id?: string
          product_id: string
          quantity: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          dispatch_id?: string
          id?: string
          product_id?: string
          quantity?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatch_items_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatch_items_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      dispatches: {
        Row: {
          branch_id: string
          created_at: string
          dispatched_at: string
          dispatched_by: string
          driver_id: string
          id: string
          notes: string | null
          route_id: string
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          dispatched_at?: string
          dispatched_by: string
          driver_id: string
          id?: string
          notes?: string | null
          route_id: string
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          dispatched_at?: string
          dispatched_by?: string
          driver_id?: string
          id?: string
          notes?: string | null
          route_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "dispatches_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_dispatched_by_fkey"
            columns: ["dispatched_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "dispatches_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      driver_locations: {
        Row: {
          accuracy: number | null
          created_at: string
          driver_id: string
          id: string
          lat: number
          lng: number
          recorded_at: string
          route_id: string | null
        }
        Insert: {
          accuracy?: number | null
          created_at?: string
          driver_id: string
          id?: string
          lat: number
          lng: number
          recorded_at?: string
          route_id?: string | null
        }
        Update: {
          accuracy?: number | null
          created_at?: string
          driver_id?: string
          id?: string
          lat?: number
          lng?: number
          recorded_at?: string
          route_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "driver_locations_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      expenses: {
        Row: {
          amount: number
          branch_id: string
          created_at: string
          description: string
          driver_id: string
          expense_date: string
          id: string
          photo_url: string | null
          route_id: string | null
          updated_at: string
        }
        Insert: {
          amount: number
          branch_id: string
          created_at?: string
          description: string
          driver_id: string
          expense_date?: string
          id?: string
          photo_url?: string | null
          route_id?: string | null
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string
          created_at?: string
          description?: string
          driver_id?: string
          expense_date?: string
          id?: string
          photo_url?: string | null
          route_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "expenses_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "expenses_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      payments: {
        Row: {
          amount: number
          branch_id: string
          carried_over: boolean
          created_at: string
          customer_id: string
          delivery_id: string | null
          driver_id: string
          id: string
          method: Database["public"]["Enums"]["payment_method"]
          note: string | null
          paid_at: string
          route_id: string
          status: Database["public"]["Enums"]["payment_status"]
          updated_at: string
        }
        Insert: {
          amount: number
          branch_id: string
          carried_over?: boolean
          created_at?: string
          customer_id: string
          delivery_id?: string | null
          driver_id: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          paid_at?: string
          route_id: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Update: {
          amount?: number
          branch_id?: string
          carried_over?: boolean
          created_at?: string
          customer_id?: string
          delivery_id?: string | null
          driver_id?: string
          id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          note?: string | null
          paid_at?: string
          route_id?: string
          status?: Database["public"]["Enums"]["payment_status"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_delivery_id_fkey"
            columns: ["delivery_id"]
            isOneToOne: false
            referencedRelation: "deliveries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          allow_returns: boolean
          bodega_category: string | null
          bodega_id: string | null
          created_at: string
          display_order: number
          id: string
          is_active: boolean
          is_bodega_supply: boolean
          name: string
          price: number
          unit: string
          updated_at: string
        }
        Insert: {
          allow_returns?: boolean
          bodega_category?: string | null
          bodega_id?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_bodega_supply?: boolean
          name: string
          price?: number
          unit?: string
          updated_at?: string
        }
        Update: {
          allow_returns?: boolean
          bodega_category?: string | null
          bodega_id?: string | null
          created_at?: string
          display_order?: number
          id?: string
          is_active?: boolean
          is_bodega_supply?: boolean
          name?: string
          price?: number
          unit?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_bodega_id_fkey"
            columns: ["bodega_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          branch_id: string | null
          created_at: string
          full_name: string | null
          id: string
          is_active: boolean
          phone: string | null
          updated_at: string
        }
        Insert: {
          branch_id?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Update: {
          branch_id?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          is_active?: boolean
          phone?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "profiles_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
        ]
      }
      route_customers: {
        Row: {
          created_at: string
          customer_id: string
          position: number
          route_id: string
        }
        Insert: {
          created_at?: string
          customer_id: string
          position?: number
          route_id: string
        }
        Update: {
          created_at?: string
          customer_id?: string
          position?: number
          route_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "route_customers_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "route_customers_route_id_fkey"
            columns: ["route_id"]
            isOneToOne: false
            referencedRelation: "routes"
            referencedColumns: ["id"]
          },
        ]
      }
      routes: {
        Row: {
          branch_id: string
          created_at: string
          driver_id: string | null
          id: string
          is_active: boolean
          name: string
          route_mode: Database["public"]["Enums"]["route_mode"]
          updated_at: string
        }
        Insert: {
          branch_id: string
          created_at?: string
          driver_id?: string | null
          id?: string
          is_active?: boolean
          name: string
          route_mode?: Database["public"]["Enums"]["route_mode"]
          updated_at?: string
        }
        Update: {
          branch_id?: string
          created_at?: string
          driver_id?: string | null
          id?: string
          is_active?: boolean
          name?: string
          route_mode?: Database["public"]["Enums"]["route_mode"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "routes_branch_id_fkey"
            columns: ["branch_id"]
            isOneToOne: false
            referencedRelation: "branches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "routes_driver_id_fkey"
            columns: ["driver_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      truck_returns: {
        Row: {
          created_at: string
          dispatch_id: string
          id: string
          notes: string | null
          product_id: string
          quantity: number
          returned_at: string
          returned_by: string
        }
        Insert: {
          created_at?: string
          dispatch_id: string
          id?: string
          notes?: string | null
          product_id: string
          quantity: number
          returned_at?: string
          returned_by: string
        }
        Update: {
          created_at?: string
          dispatch_id?: string
          id?: string
          notes?: string | null
          product_id?: string
          quantity?: number
          returned_at?: string
          returned_by?: string
        }
        Relationships: [
          {
            foreignKeyName: "truck_returns_dispatch_id_fkey"
            columns: ["dispatch_id"]
            isOneToOne: false
            referencedRelation: "dispatches"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "truck_returns_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "truck_returns_returned_by_fkey"
            columns: ["returned_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      carry_over_pending_balance: {
        Args: { p_branch_id: string; p_date: string }
        Returns: undefined
      }
      current_branch_id: { Args: never; Returns: string }
      get_price_for: {
        Args: { _customer_id: string; _product_id: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
    }
    Enums: {
      app_role: "owner" | "supervisor" | "cashier" | "driver" | "transfer_driver"
      branch_receipt_status: "received" | "incomplete"
      supply_correction_status: "pending" | "delivered"
      customer_category: "retail" | "hotel" | "restaurant"
      delivery_failure_reason: "closed" | "no_order" | "other"
      delivery_status: "pending" | "delivered" | "failed"
      order_status: "confirmed" | "delivered" | "failed" | "cancelled"
      payment_method: "cash" | "transfer" | "credit" | "other"
      payment_status: "paid" | "pending"
      route_mode: "dispatch" | "preorder"
      supply_order_status: "pending" | "confirmed" | "cancelled" | "delivered"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["owner", "supervisor", "cashier", "driver", "transfer_driver"],
      branch_receipt_status: ["received", "incomplete"],
      supply_correction_status: ["pending", "delivered"],
      customer_category: ["retail", "hotel", "restaurant"],
      delivery_failure_reason: ["closed", "no_order", "other"],
      delivery_status: ["pending", "delivered", "failed"],
      order_status: ["confirmed", "delivered", "failed", "cancelled"],
      payment_method: ["cash", "transfer", "credit", "other"],
      payment_status: ["paid", "pending"],
      route_mode: ["dispatch", "preorder"],
      supply_order_status: ["pending", "confirmed", "cancelled", "delivered"],
    },
  },
} as const
