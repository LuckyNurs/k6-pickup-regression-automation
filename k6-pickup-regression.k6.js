import http from "k6/http";
import { check, sleep } from "k6";

// =====================
// GLOBAL STATE
// =====================
let accessToken = "mock-token";
let successLogs = [];
let errorLogs = [];
let processedOutlets = [];

const BASE_URL = __ENV.BASE_URL || "https://api.example.com";

// =====================
// K6 OPTIONS
// =====================
export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    http_req_duration: ["p(95)<5000"],
    http_req_failed: ["rate<0.1"],
  },
};

// =====================
// MOCK REPORTING
// =====================
function sendReport() {
  console.log("=== REGRESSION SUMMARY ===");
  console.log(`Outlets tested: ${processedOutlets.length}`);
  console.log(`Success: ${successLogs.length}`);
  console.log(`Failed: ${errorLogs.length}`);
}

// =====================
// MAIN FLOW
// =====================
export default function () {
  console.log("🚀 Starting Pickup Regression (Portfolio Version)");

  authenticate();
  sleep(1);

  const coordinates = [
    { latitude: "-6.24", longitude: "106.78" },
  ];

  coordinates.forEach(({ latitude, longitude }) => {
    const { omsOutlets, esbOutlets } = getNearbyOutlets(latitude, longitude);

    omsOutlets.forEach(runOmsFlow);
    esbOutlets.forEach(runEsbFlow);
  });

  sendReport();
}

// =====================
// AUTH
// =====================
function authenticate() {
  const res = http.post(
    `${BASE_URL}/auth/login`,
    JSON.stringify({
      username: "demo_user",
      pin: "123456",
    }),
    { headers: { "Content-Type": "application/json" } }
  );

  check(res, { "login success": (r) => r.status === 200 });
  accessToken = res.json()?.token || "mock-token";
}

// =====================
// OUTLET DISCOVERY
// =====================
function getNearbyOutlets(lat, lng) {
  const res = http.get(
    `${BASE_URL}/outlets/nearby?lat=${lat}&lng=${lng}`,
    { headers: authHeader() }
  );

  check(res, { "outlets loaded": (r) => r.status === 200 });

  const outlets = res.json()?.data || [];

  return {
    omsOutlets: outlets.filter(o => o.channel === "OMS"),
    esbOutlets: outlets.filter(o => o.channel === "ESB"),
  };
}

// =====================
// OMS FLOW
// =====================
function runOmsFlow(outlet) {
  try {
    processedOutlets.push(outlet.code);

    const menuRes = http.get(
      `${BASE_URL}/oms/menu/${outlet.code}`,
      { headers: authHeader() }
    );

    check(menuRes, { "OMS menu fetched": (r) => r.status === 200 });

    const products = menuRes.json()?.products || [];
    const validProduct = products.find(p => !p.hasVariant && p.hasStock);

    if (!validProduct) return;

    const cartRes = http.post(
      `${BASE_URL}/oms/cart`,
      JSON.stringify({
        outletCode: outlet.code,
        productId: validProduct.id,
        qty: 1,
      }),
      { headers: authHeaderJson() }
    );

    check(cartRes, { "add to cart": (r) => r.status === 200 });

    const paymentRes = http.post(
      `${BASE_URL}/oms/order`,
      JSON.stringify({
        cartId: cartRes.json()?.cartId,
        paymentMethod: "MockWallet",
      }),
      { headers: authHeaderJson() }
    );

    if (paymentRes.status === 201) {
      successLogs.push({ outlet: outlet.code, flow: "OMS" });
    } else {
      errorLogs.push({ outlet: outlet.code, flow: "OMS" });
    }
  } catch (e) {
    errorLogs.push({ outlet: outlet.code, error: e.message });
  }
}

// =====================
// ESB FLOW
// =====================
function runEsbFlow(outlet) {
  try {
    processedOutlets.push(outlet.code);

    const pageRes = http.get(
      `${BASE_URL}/esb/page/${outlet.id}`,
      { headers: authHeader() }
    );

    check(pageRes, { "ESB page loaded": (r) => r.status === 200 });

    successLogs.push({ outlet: outlet.code, flow: "ESB" });
  } catch (e) {
    errorLogs.push({ outlet: outlet.code, error: e.message });
  }
}

// =====================
// HELPERS
// =====================
function authHeader() {
  return { Authorization: `Bearer ${accessToken}` };
}

function authHeaderJson() {
  return {
    Authorization: `Bearer ${accessToken}`,
    "Content-Type": "application/json",
  };
}
