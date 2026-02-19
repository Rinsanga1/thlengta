const Razorpay = require("razorpay");
const crypto = require("crypto");
const { dbGet, dbRun } = require("../../db/helpers");
const { getOwnerId } = require("../middleware/auth");
const { normalizePlan } = require("../utils/plan.utils");

// Pricing configuration - Yearly billing (in INR)
const PLAN_PRICING = {
  plus: {
    amount: 718800,
    monthlyDisplay: 599,
    name: "Plus Plan",
    description: "Plus Plan - Yearly Subscription",
    features: ["1 workplace", "10 employees", "QR attendance", "Download reports"]
  },
  pro: {
    amount: 11998800,
    monthlyDisplay: 999,
    name: "Pro Plan",
    description: "Pro Plan - Yearly Subscription",
    features: ["20 workplaces", "200 employees", "QR attendance", "Priority support"]
  },
  enterprise: {
    amount: 35998800,
    monthlyDisplay: 29999,
    name: "Enterprise Plan",
    description: "Enterprise Plan - Yearly Subscription",
    features: ["Unlimited workplaces", "Unlimited employees", "Dedicated support", "Custom onboarding"]
  }
};

const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET
});

exports.show = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    const planParam = normalizePlan(req.params.plan);
    
    if (!PLAN_PRICING[planParam]) {
      return res.status(404).send("Invalid plan selected.");
    }
    
    const user = await dbGet(
      "SELECT id, email, name, phone, plan FROM users WHERE id = ?",
      [userId]
    );
    
    if (!user) {
      return res.status(404).send("User not found.");
    }
    
    const currentPlan = normalizePlan(user.plan);
    const planHierarchy = { free: 0, plus: 1, pro: 2, enterprise: 3 };
    if (planHierarchy[currentPlan] >= planHierarchy[planParam]) {
      return res.redirect("/owner/upgrade?error=" + encodeURIComponent("You cannot purchase this plan. Please choose a higher tier plan."));
    }
    
    const pricing = PLAN_PRICING[planParam];
    
    res.renderPage("checkout/show", {
      title: `Checkout - ${pricing.name}`,
      plan: planParam,
      pricing: pricing,
      user: user,
      razorpayKeyId: process.env.RAZORPAY_KEY_ID,
      error: req.query.error || null,
      message: req.query.message || null
    });
  } catch (err) {
    console.error("Checkout show error:", err);
    return res.status(500).send("Server error");
  }
};

exports.createOrder = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    const { plan } = req.body;
    const planKey = normalizePlan(plan);
    
    if (!PLAN_PRICING[planKey]) {
      return res.status(400).json({ error: "Invalid plan" });
    }
    
    const user = await dbGet(
      "SELECT id, email, name FROM users WHERE id = ?",
      [userId]
    );
    
    if (!user) {
      return res.status(404).json({ error: "User not found" });
    }
    
    const pricing = PLAN_PRICING[planKey];
    
    const orderOptions = {
      amount: pricing.amount,
      currency: "INR",
      receipt: `receipt_${userId}_${Date.now()}`,
      notes: {
        user_id: userId,
        plan: planKey,
        user_email: user.email
      }
    };
    
    const order = await razorpay.orders.create(orderOptions);
    
    await dbRun(
      `INSERT INTO payment_orders 
       (order_id, user_id, plan, amount, currency, status, created_at) 
       VALUES (?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)`,
      [order.id, userId, planKey, pricing.amount, "INR", "created"]
    );
    
    res.json({
      order_id: order.id,
      amount: pricing.amount,
      currency: "INR",
      key_id: process.env.RAZORPAY_KEY_ID,
      name: user.name || user.email,
      email: user.email,
      description: pricing.description
    });
  } catch (err) {
    console.error("Create order error:", err);
    return res.status(500).json({ error: "Failed to create order" });
  }
};

exports.verify = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    const { 
      razorpay_payment_id, 
      razorpay_order_id, 
      razorpay_signature 
    } = req.body;
    
    if (!razorpay_payment_id || !razorpay_order_id || !razorpay_signature) {
      return res.status(400).json({ error: "Missing payment details" });
    }
    
    const body = razorpay_order_id + "|" + razorpay_payment_id;
    const expectedSignature = crypto
      .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET)
      .update(body)
      .digest("hex");
    
    const isAuthentic = expectedSignature === razorpay_signature;
    
    if (!isAuthentic) {
      await dbRun(
        "UPDATE payment_orders SET status = ?, error_message = ? WHERE order_id = ?",
        ["failed", "Invalid signature", razorpay_order_id]
      );
      return res.status(400).json({ error: "Invalid payment signature" });
    }
    
    const order = await dbGet(
      "SELECT * FROM payment_orders WHERE order_id = ? AND user_id = ?",
      [razorpay_order_id, userId]
    );
    
    if (!order) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    if (order.status === "completed") {
      return res.json({ success: true, message: "Payment already processed" });
    }
    
    await dbRun(
      `UPDATE payment_orders 
       SET status = ?, payment_id = ?, verified_at = CURRENT_TIMESTAMP 
       WHERE order_id = ?`,
      ["completed", razorpay_payment_id, razorpay_order_id]
    );
    
    await dbRun(
      "UPDATE users SET plan = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      [order.plan, userId]
    );
    
    res.json({ 
      success: true, 
      message: "Payment successful! Your plan has been upgraded." 
    });
  } catch (err) {
    console.error("Payment verification error:", err);
    return res.status(500).json({ error: "Payment verification failed" });
  }
};

exports.success = async (req, res) => {
  try {
    const userId = getOwnerId(req);
    
    const user = await dbGet(
      "SELECT plan FROM users WHERE id = ?",
      [userId]
    );
    
    res.renderPage("checkout/success", {
      title: "Payment Successful",
      plan: user?.plan || "unknown"
    });
  } catch (err) {
    console.error("Success page error:", err);
    res.redirect("/owner/dashboard");
  }
};
