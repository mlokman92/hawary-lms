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
      academies: {
        Row: {
          address: string | null
          city: string | null
          country: string
          created_at: string
          created_by: string | null
          currency: string
          email: string | null
          id: string
          logo_url: string | null
          name: string
          phone: string | null
          postcode: string | null
          registration_no: string | null
          slug: string
          sst_number: string | null
          sst_registered: boolean
          state: string | null
          status: Database["public"]["Enums"]["academy_status"]
          timezone: string
          updated_at: string
        }
        Insert: {
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name: string
          phone?: string | null
          postcode?: string | null
          registration_no?: string | null
          slug: string
          sst_number?: string | null
          sst_registered?: boolean
          state?: string | null
          status?: Database["public"]["Enums"]["academy_status"]
          timezone?: string
          updated_at?: string
        }
        Update: {
          address?: string | null
          city?: string | null
          country?: string
          created_at?: string
          created_by?: string | null
          currency?: string
          email?: string | null
          id?: string
          logo_url?: string | null
          name?: string
          phone?: string | null
          postcode?: string | null
          registration_no?: string | null
          slug?: string
          sst_number?: string | null
          sst_registered?: boolean
          state?: string | null
          status?: Database["public"]["Enums"]["academy_status"]
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      academy_invitations: {
        Row: {
          academy_id: string
          accepted_at: string | null
          accepted_user_id: string | null
          created_at: string
          email: string
          expires_at: string
          id: string
          instructor_id: string | null
          invited_by: string | null
          role: "admin" | "trainer" | "student"
          status: Database["public"]["Enums"]["invitation_status"]
          student_id: string | null
          token: string
          updated_at: string
        }
        Insert: {
          academy_id: string
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email: string
          expires_at?: string
          id?: string
          instructor_id?: string | null
          invited_by?: string | null
          role?: "admin" | "trainer" | "student"
          status?: Database["public"]["Enums"]["invitation_status"]
          student_id?: string | null
          token: string
          updated_at?: string
        }
        Update: {
          academy_id?: string
          accepted_at?: string | null
          accepted_user_id?: string | null
          created_at?: string
          email?: string
          expires_at?: string
          id?: string
          instructor_id?: string | null
          invited_by?: string | null
          role?: "admin" | "trainer" | "student"
          status?: Database["public"]["Enums"]["invitation_status"]
          student_id?: string | null
          token?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_invitations_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_invitations_academy_id_instructor_id_fkey"
            columns: ["academy_id", "instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "academy_invitations_academy_id_student_id_fkey"
            columns: ["academy_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "academy_invitations_accepted_user_id_fkey"
            columns: ["accepted_user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_invitations_invited_by_fkey"
            columns: ["invited_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_members: {
        Row: {
          academy_id: string
          created_at: string
          id: string
          joined_at: string
          role: "admin" | "trainer" | "student"
          status: Database["public"]["Enums"]["member_status"]
          student_no: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          academy_id: string
          created_at?: string
          id?: string
          joined_at?: string
          role: "admin" | "trainer" | "student"
          status?: Database["public"]["Enums"]["member_status"]
          student_no?: string | null
          updated_at?: string
          user_id: string
        }
        Update: {
          academy_id?: string
          created_at?: string
          id?: string
          joined_at?: string
          role?: "admin" | "trainer" | "student"
          status?: Database["public"]["Enums"]["member_status"]
          student_no?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_members_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "academy_members_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      academy_payment_settings: {
        Row: {
          academy_id: string
          created_at: string
          provider: Database["public"]["Enums"]["payment_provider"]
          toyyibpay_category_code: string | null
          toyyibpay_enabled: boolean
          toyyibpay_has_secret: boolean
          toyyibpay_is_sandbox: boolean
          toyyibpay_secret_last4: string | null
          toyyibpay_secret_set_at: string | null
          toyyibpay_secret_set_by: string | null
          updated_at: string
        }
        Insert: {
          academy_id: string
          created_at?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          toyyibpay_category_code?: string | null
          toyyibpay_enabled?: boolean
          toyyibpay_has_secret?: boolean
          toyyibpay_is_sandbox?: boolean
          toyyibpay_secret_last4?: string | null
          toyyibpay_secret_set_at?: string | null
          toyyibpay_secret_set_by?: string | null
          updated_at?: string
        }
        Update: {
          academy_id?: string
          created_at?: string
          provider?: Database["public"]["Enums"]["payment_provider"]
          toyyibpay_category_code?: string | null
          toyyibpay_enabled?: boolean
          toyyibpay_has_secret?: boolean
          toyyibpay_is_sandbox?: boolean
          toyyibpay_secret_last4?: string | null
          toyyibpay_secret_set_at?: string | null
          toyyibpay_secret_set_by?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "academy_payment_settings_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: true
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_attempts: {
        Row: {
          academy_id: string
          answers: Json | null
          assessment_id: string
          attempt_no: number
          created_at: string
          graded_at: string | null
          graded_by: string | null
          id: string
          max_score: number | null
          score: number | null
          started_at: string
          status: Database["public"]["Enums"]["attempt_status"]
          student_id: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          academy_id: string
          answers?: Json | null
          assessment_id: string
          attempt_no?: number
          created_at?: string
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          max_score?: number | null
          score?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          student_id: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          academy_id?: string
          answers?: Json | null
          assessment_id?: string
          attempt_no?: number
          created_at?: string
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          max_score?: number | null
          score?: number | null
          started_at?: string
          status?: Database["public"]["Enums"]["attempt_status"]
          student_id?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_attempts_academy_id_assessment_id_fkey"
            columns: ["academy_id", "assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "assessment_attempts_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessment_attempts_academy_id_student_id_fkey"
            columns: ["academy_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "assessment_attempts_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assessment_questions: {
        Row: {
          academy_id: string
          assessment_id: string
          correct_answer: Json | null
          created_at: string
          id: string
          options: Json | null
          points: number
          prompt: string
          question_type: Database["public"]["Enums"]["question_type"]
          sort_order: number
          updated_at: string
        }
        Insert: {
          academy_id: string
          assessment_id: string
          correct_answer?: Json | null
          created_at?: string
          id?: string
          options?: Json | null
          points?: number
          prompt: string
          question_type: Database["public"]["Enums"]["question_type"]
          sort_order?: number
          updated_at?: string
        }
        Update: {
          academy_id?: string
          assessment_id?: string
          correct_answer?: Json | null
          created_at?: string
          id?: string
          options?: Json | null
          points?: number
          prompt?: string
          question_type?: Database["public"]["Enums"]["question_type"]
          sort_order?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessment_questions_academy_id_assessment_id_fkey"
            columns: ["academy_id", "assessment_id"]
            isOneToOne: false
            referencedRelation: "assessments"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "assessment_questions_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
        ]
      }
      assessments: {
        Row: {
          academy_id: string
          available_from: string | null
          available_until: string | null
          course_id: string
          created_at: string
          created_by: string | null
          description: string | null
          duration_minutes: number | null
          id: string
          instructions: Json
          is_published: boolean
          max_attempts: number
          module_id: string
          sort_order: number
          title: string
          total_points: number
          type: Database["public"]["Enums"]["assessment_type"]
          updated_at: string
        }
        Insert: {
          academy_id: string
          available_from?: string | null
          available_until?: string | null
          course_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          instructions?: Json
          is_published?: boolean
          max_attempts?: number
          module_id: string
          sort_order?: number
          title: string
          total_points?: number
          type?: Database["public"]["Enums"]["assessment_type"]
          updated_at?: string
        }
        Update: {
          academy_id?: string
          available_from?: string | null
          available_until?: string | null
          course_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          duration_minutes?: number | null
          id?: string
          instructions?: Json
          is_published?: boolean
          max_attempts?: number
          module_id?: string
          sort_order?: number
          title?: string
          total_points?: number
          type?: Database["public"]["Enums"]["assessment_type"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assessments_academy_id_course_id_fkey"
            columns: ["academy_id", "course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "assessments_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assessments_course_id_module_id_fkey"
            columns: ["course_id", "module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["course_id", "id"]
          },
          {
            foreignKeyName: "assessments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignment_submissions: {
        Row: {
          academy_id: string
          assignment_id: string
          attachment_url: string | null
          content: string | null
          created_at: string
          feedback: string | null
          grade: number | null
          graded_at: string | null
          graded_by: string | null
          id: string
          status: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at: string | null
          updated_at: string
        }
        Insert: {
          academy_id: string
          assignment_id: string
          attachment_url?: string | null
          content?: string | null
          created_at?: string
          feedback?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          status?: Database["public"]["Enums"]["submission_status"]
          student_id: string
          submitted_at?: string | null
          updated_at?: string
        }
        Update: {
          academy_id?: string
          assignment_id?: string
          attachment_url?: string | null
          content?: string | null
          created_at?: string
          feedback?: string | null
          grade?: number | null
          graded_at?: string | null
          graded_by?: string | null
          id?: string
          status?: Database["public"]["Enums"]["submission_status"]
          student_id?: string
          submitted_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignment_submissions_academy_id_assignment_id_fkey"
            columns: ["academy_id", "assignment_id"]
            isOneToOne: false
            referencedRelation: "assignments"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "assignment_submissions_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignment_submissions_academy_id_student_id_fkey"
            columns: ["academy_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "assignment_submissions_graded_by_fkey"
            columns: ["graded_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      assignments: {
        Row: {
          academy_id: string
          allow_late: boolean
          course_id: string
          created_at: string
          created_by: string | null
          due_at: string | null
          id: string
          instructions: Json
          is_published: boolean
          module_id: string
          sort_order: number
          title: string
          total_points: number
          updated_at: string
        }
        Insert: {
          academy_id: string
          allow_late?: boolean
          course_id: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          instructions?: Json
          is_published?: boolean
          module_id: string
          sort_order?: number
          title: string
          total_points?: number
          updated_at?: string
        }
        Update: {
          academy_id?: string
          allow_late?: boolean
          course_id?: string
          created_at?: string
          created_by?: string | null
          due_at?: string | null
          id?: string
          instructions?: Json
          is_published?: boolean
          module_id?: string
          sort_order?: number
          title?: string
          total_points?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "assignments_academy_id_course_id_fkey"
            columns: ["academy_id", "course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "assignments_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assignments_course_id_module_id_fkey"
            columns: ["course_id", "module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["course_id", "id"]
          },
          {
            foreignKeyName: "assignments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      course_instructors: {
        Row: {
          academy_id: string
          course_id: string
          created_at: string
          id: string
          instructor_id: string
        }
        Insert: {
          academy_id: string
          course_id: string
          created_at?: string
          id?: string
          instructor_id: string
        }
        Update: {
          academy_id?: string
          course_id?: string
          created_at?: string
          id?: string
          instructor_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_instructors_academy_id_course_id_fkey"
            columns: ["academy_id", "course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "course_instructors_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_instructors_academy_id_instructor_id_fkey"
            columns: ["academy_id", "instructor_id"]
            isOneToOne: false
            referencedRelation: "instructors"
            referencedColumns: ["academy_id", "id"]
          },
        ]
      }
      course_modules: {
        Row: {
          academy_id: string
          course_id: string
          created_at: string
          created_by: string | null
          description: string | null
          id: string
          is_published: boolean
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          academy_id: string
          course_id: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_published?: boolean
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          academy_id?: string
          course_id?: string
          created_at?: string
          created_by?: string | null
          description?: string | null
          id?: string
          is_published?: boolean
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "course_modules_academy_id_course_id_fkey"
            columns: ["academy_id", "course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "course_modules_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "course_modules_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      courses: {
        Row: {
          academy_id: string
          code: string | null
          cover_url: string | null
          created_at: string
          created_by: string | null
          currency: string
          description: string | null
          id: string
          price_sen: number
          status: Database["public"]["Enums"]["course_status"]
          title: string
          updated_at: string
        }
        Insert: {
          academy_id: string
          code?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          price_sen?: number
          status?: Database["public"]["Enums"]["course_status"]
          title: string
          updated_at?: string
        }
        Update: {
          academy_id?: string
          code?: string | null
          cover_url?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          description?: string | null
          id?: string
          price_sen?: number
          status?: Database["public"]["Enums"]["course_status"]
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "courses_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "courses_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      enrollments: {
        Row: {
          academy_id: string
          completed_at: string | null
          course_id: string
          created_at: string
          enrolled_at: string
          id: string
          status: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          updated_at: string
        }
        Insert: {
          academy_id: string
          completed_at?: string | null
          course_id: string
          created_at?: string
          enrolled_at?: string
          id?: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id: string
          updated_at?: string
        }
        Update: {
          academy_id?: string
          completed_at?: string | null
          course_id?: string
          created_at?: string
          enrolled_at?: string
          id?: string
          status?: Database["public"]["Enums"]["enrollment_status"]
          student_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_academy_id_course_id_fkey"
            columns: ["academy_id", "course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "enrollments_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "enrollments_academy_id_student_id_fkey"
            columns: ["academy_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["academy_id", "id"]
          },
        ]
      }
      instructors: {
        Row: {
          academy_id: string
          address: string | null
          archived_at: string | null
          avatar_url: string | null
          bio: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          email: string | null
          full_name: string | null
          gender: Database["public"]["Enums"]["gender"] | null
          ic_number: string | null
          id: string
          instructor_no: string
          phone: string | null
          specialization: string | null
          status: Database["public"]["Enums"]["instructor_status"]
          updated_at: string
          user_id: string | null
        }
        Insert: {
          academy_id: string
          address?: string | null
          archived_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          ic_number?: string | null
          id?: string
          instructor_no: string
          phone?: string | null
          specialization?: string | null
          status?: Database["public"]["Enums"]["instructor_status"]
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          academy_id?: string
          address?: string | null
          archived_at?: string | null
          avatar_url?: string | null
          bio?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          ic_number?: string | null
          id?: string
          instructor_no?: string
          phone?: string | null
          specialization?: string | null
          status?: Database["public"]["Enums"]["instructor_status"]
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "instructors_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructors_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "instructors_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      invoice_items: {
        Row: {
          academy_id: string
          amount_sen: number
          created_at: string
          description: string
          id: string
          invoice_id: string
          quantity: number
          unit_price_sen: number
        }
        Insert: {
          academy_id: string
          amount_sen?: number
          created_at?: string
          description: string
          id?: string
          invoice_id: string
          quantity?: number
          unit_price_sen?: number
        }
        Update: {
          academy_id?: string
          amount_sen?: number
          created_at?: string
          description?: string
          id?: string
          invoice_id?: string
          quantity?: number
          unit_price_sen?: number
        }
        Relationships: [
          {
            foreignKeyName: "invoice_items_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoice_items_academy_id_invoice_id_fkey"
            columns: ["academy_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["academy_id", "id"]
          },
        ]
      }
      invoices: {
        Row: {
          academy_id: string
          amount_paid_sen: number
          course_id: string | null
          created_at: string
          created_by: string | null
          currency: string
          due_at: string | null
          enrollment_id: string | null
          id: string
          invoice_no: string
          issued_at: string | null
          notes: string | null
          pay_token: string | null
          pay_token_created_at: string | null
          status: Database["public"]["Enums"]["invoice_status"]
          student_id: string
          subtotal_sen: number
          tax_sen: number
          total_sen: number
          updated_at: string
        }
        Insert: {
          academy_id: string
          amount_paid_sen?: number
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_at?: string | null
          enrollment_id?: string | null
          id?: string
          invoice_no: string
          issued_at?: string | null
          notes?: string | null
          pay_token?: string | null
          pay_token_created_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id: string
          subtotal_sen?: number
          tax_sen?: number
          total_sen?: number
          updated_at?: string
        }
        Update: {
          academy_id?: string
          amount_paid_sen?: number
          course_id?: string | null
          created_at?: string
          created_by?: string | null
          currency?: string
          due_at?: string | null
          enrollment_id?: string | null
          id?: string
          invoice_no?: string
          issued_at?: string | null
          notes?: string | null
          pay_token?: string | null
          pay_token_created_at?: string | null
          status?: Database["public"]["Enums"]["invoice_status"]
          student_id?: string
          subtotal_sen?: number
          tax_sen?: number
          total_sen?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "invoices_academy_id_course_id_fkey"
            columns: ["academy_id", "course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "invoices_academy_id_enrollment_id_fkey"
            columns: ["academy_id", "enrollment_id"]
            isOneToOne: false
            referencedRelation: "enrollments"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "invoices_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "invoices_academy_id_student_id_fkey"
            columns: ["academy_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "invoices_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notes: {
        Row: {
          academy_id: string
          body: Json
          content: string
          course_id: string
          created_at: string
          created_by: string | null
          id: string
          is_published: boolean
          module_id: string
          sort_order: number
          title: string
          updated_at: string
        }
        Insert: {
          academy_id: string
          body?: Json
          content?: string
          course_id: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          module_id: string
          sort_order?: number
          title: string
          updated_at?: string
        }
        Update: {
          academy_id?: string
          body?: Json
          content?: string
          course_id?: string
          created_at?: string
          created_by?: string | null
          id?: string
          is_published?: boolean
          module_id?: string
          sort_order?: number
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "notes_academy_id_course_id_fkey"
            columns: ["academy_id", "course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "notes_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "notes_course_id_module_id_fkey"
            columns: ["course_id", "module_id"]
            isOneToOne: false
            referencedRelation: "course_modules"
            referencedColumns: ["course_id", "id"]
          },
          {
            foreignKeyName: "notes_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      payment_intents: {
        Row: {
          academy_id: string
          amount_sen: number
          bill_code: string | null
          created_at: string
          expires_at: string | null
          host: string
          id: string
          invoice_id: string
          needs_reconciliation: boolean
          nonce: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_ref: string | null
          status: string
          updated_at: string
        }
        Insert: {
          academy_id: string
          amount_sen: number
          bill_code?: string | null
          created_at?: string
          expires_at?: string | null
          host: string
          id?: string
          invoice_id: string
          needs_reconciliation?: boolean
          nonce?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_ref?: string | null
          status?: string
          updated_at?: string
        }
        Update: {
          academy_id?: string
          amount_sen?: number
          bill_code?: string | null
          created_at?: string
          expires_at?: string | null
          host?: string
          id?: string
          invoice_id?: string
          needs_reconciliation?: boolean
          nonce?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_ref?: string | null
          status?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payment_intents_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payment_intents_academy_id_invoice_id_fkey"
            columns: ["academy_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["academy_id", "id"]
          },
        ]
      }
      payments: {
        Row: {
          academy_id: string
          amount_sen: number
          created_at: string
          created_by: string | null
          currency: string
          id: string
          invoice_id: string
          method: Database["public"]["Enums"]["payment_method"]
          paid_at: string | null
          provider: Database["public"]["Enums"]["payment_provider"]
          provider_ref: string | null
          status: Database["public"]["Enums"]["payment_status"]
          student_id: string | null
          updated_at: string
        }
        Insert: {
          academy_id: string
          amount_sen: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_id: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          student_id?: string | null
          updated_at?: string
        }
        Update: {
          academy_id?: string
          amount_sen?: number
          created_at?: string
          created_by?: string | null
          currency?: string
          id?: string
          invoice_id?: string
          method?: Database["public"]["Enums"]["payment_method"]
          paid_at?: string | null
          provider?: Database["public"]["Enums"]["payment_provider"]
          provider_ref?: string | null
          status?: Database["public"]["Enums"]["payment_status"]
          student_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "payments_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payments_academy_id_invoice_id_fkey"
            columns: ["academy_id", "invoice_id"]
            isOneToOne: false
            referencedRelation: "invoices"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "payments_academy_id_student_id_fkey"
            columns: ["academy_id", "student_id"]
            isOneToOne: false
            referencedRelation: "students"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "payments_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          full_name: string | null
          id: string
          phone: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id: string
          phone?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          full_name?: string | null
          id?: string
          phone?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      students: {
        Row: {
          academy_id: string
          address: string | null
          archived_at: string | null
          avatar_url: string | null
          created_at: string
          created_by: string | null
          date_of_birth: string | null
          email: string | null
          full_name: string | null
          gender: Database["public"]["Enums"]["gender"] | null
          ic_number: string | null
          id: string
          phone: string | null
          status: Database["public"]["Enums"]["student_status"]
          student_no: string
          updated_at: string
          user_id: string | null
        }
        Insert: {
          academy_id: string
          address?: string | null
          archived_at?: string | null
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          ic_number?: string | null
          id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          student_no: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          academy_id?: string
          address?: string | null
          archived_at?: string | null
          avatar_url?: string | null
          created_at?: string
          created_by?: string | null
          date_of_birth?: string | null
          email?: string | null
          full_name?: string | null
          gender?: Database["public"]["Enums"]["gender"] | null
          ic_number?: string | null
          id?: string
          phone?: string | null
          status?: Database["public"]["Enums"]["student_status"]
          student_no?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "students_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "students_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      course_enrollment_stats: {
        Row: {
          academy_id: string | null
          active_students: number | null
          course_id: string | null
        }
        Relationships: [
          {
            foreignKeyName: "enrollments_academy_id_course_id_fkey"
            columns: ["academy_id", "course_id"]
            isOneToOne: false
            referencedRelation: "courses"
            referencedColumns: ["academy_id", "id"]
          },
          {
            foreignKeyName: "enrollments_academy_id_fkey"
            columns: ["academy_id"]
            isOneToOne: false
            referencedRelation: "academies"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Functions: {
      accept_invitation: { Args: { _token: string }; Returns: Json }
      create_instructor_invitation: {
        Args: { _instructor_id: string }
        Returns: Json
      }
      create_invitation: { Args: { _student_id: string }; Returns: Json }
      ensure_pay_token: { Args: { _invoice: string }; Returns: string }
      get_attempt: { Args: { _attempt_id: string }; Returns: Json }
      get_pay_status: {
        Args: { _token: string }
        Returns: {
          intent_status: string
          invoice_status: string
        }[]
      }
      get_public_invoice: {
        Args: { _token: string }
        Returns: {
          academy_logo_url: string
          academy_name: string
          amount_paid_sen: number
          currency: string
          due_sen: number
          gateway_enabled: boolean
          invoice_no: string
          status: Database["public"]["Enums"]["invoice_status"]
          total_sen: number
        }[]
      }
      get_toyyibpay_secret: { Args: { _academy: string }; Returns: string }
      link_instructor_account: {
        Args: { _email: string; _instructor_id: string }
        Returns: Json
      }
      link_student_account: {
        Args: { _email: string; _student_id: string }
        Returns: Json
      }
      record_gateway_payment: {
        Args: {
          _amount_sen: number
          _intent_id: string
          _paid_at: string
          _provider_ref: string
        }
        Returns: string
      }
      remove_toyyibpay_credentials: {
        Args: { _academy: string }
        Returns: undefined
      }
      reorder_course_modules: {
        Args: { p_course_id: string; p_ordered_ids: string[] }
        Returns: undefined
      }
      reorder_module_items: {
        Args: { p_kind: string; p_module_id: string; p_ordered_ids: string[] }
        Returns: undefined
      }
      resend_invitation: { Args: { _invitation_id: string }; Returns: Json }
      revoke_invitation: {
        Args: { _invitation_id: string }
        Returns: undefined
      }
      save_attempt_answers: {
        Args: { _answers: Json; _attempt_id: string }
        Returns: Json
      }
      set_toyyibpay_credentials: {
        Args: {
          _academy: string
          _category: string
          _enabled: boolean
          _is_sandbox: boolean
          _secret: string
        }
        Returns: Json
      }
      start_attempt: { Args: { _assessment_id: string }; Returns: Json }
      submit_attempt: { Args: { _attempt_id: string }; Returns: Json }
    }
    Enums: {
      academy_status: "active" | "suspended" | "cancelled"
      assessment_type: "quiz" | "exam" | "survey"
      attempt_status: "in_progress" | "submitted" | "graded"
      course_status: "draft" | "published" | "archived"
      enrollment_status:
        | "active"
        | "pending"
        | "completed"
        | "dropped"
        | "cancelled"
      gender: "male" | "female"
      instructor_status: "active" | "on_leave" | "inactive"
      invitation_status: "pending" | "accepted" | "revoked" | "expired"
      invoice_status:
        | "draft"
        | "issued"
        | "partially_paid"
        | "paid"
        | "overdue"
        | "void"
        | "cancelled"
      member_status: "active" | "invited" | "suspended"
      payment_method:
        | "cash"
        | "bank_transfer"
        | "fpx"
        | "card"
        | "ewallet"
        | "other"
      payment_provider: "manual" | "billplz" | "toyyibpay" | "stripe"
      payment_status: "pending" | "succeeded" | "failed" | "refunded"
      question_type:
        | "single_choice"
        | "multiple_choice"
        | "true_false"
        | "short_text"
        | "essay"
      student_status:
        | "active"
        | "trial"
        | "inactive"
        | "withdrawn"
        | "unenrolled"
      submission_status: "draft" | "submitted" | "graded" | "returned"
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
      academy_status: ["active", "suspended", "cancelled"],
      assessment_type: ["quiz", "exam", "survey"],
      attempt_status: ["in_progress", "submitted", "graded"],
      course_status: ["draft", "published", "archived"],
      enrollment_status: [
        "active",
        "pending",
        "completed",
        "dropped",
        "cancelled",
      ],
      gender: ["male", "female"],
      instructor_status: ["active", "on_leave", "inactive"],
      invitation_status: ["pending", "accepted", "revoked", "expired"],
      invoice_status: [
        "draft",
        "issued",
        "partially_paid",
        "paid",
        "overdue",
        "void",
        "cancelled",
      ],
      member_status: ["active", "invited", "suspended"],
      payment_method: [
        "cash",
        "bank_transfer",
        "fpx",
        "card",
        "ewallet",
        "other",
      ],
      payment_provider: ["manual", "billplz", "toyyibpay", "stripe"],
      payment_status: ["pending", "succeeded", "failed", "refunded"],
      question_type: [
        "single_choice",
        "multiple_choice",
        "true_false",
        "short_text",
        "essay",
      ],
      student_status: [
        "active",
        "trial",
        "inactive",
        "withdrawn",
        "unenrolled",
      ],
      submission_status: ["draft", "submitted", "graded", "returned"],
    },
  },
} as const
