import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET() {
  try {
    const supabase = await createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json(
        { error: "Please log in first." },
        { status: 401 }
      );
    }

    const { data, error } = await supabase
      .from("credit_wallets")
      .select("balance, total_earned, total_spent")
      .eq("user_id", user.id)
      .single();

    if (error || !data) {
      return NextResponse.json(
        { error: "Credit wallet not found." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      balance: data.balance,
      totalEarned: data.total_earned,
      totalSpent: data.total_spent,
    });

  } catch (error) {
    console.error("Credit API error:", error);

    return NextResponse.json(
      { error: "Could not load credits." },
      { status: 500 }
    );
  }
}