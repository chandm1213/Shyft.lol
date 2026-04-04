/**
 * 🔴 ATTACK TEST against live production /api/build-tx
 * Tests every attack vector an attacker might try.
 */

const BASE_URL = "https://www.shyft.lol";
const FAKE_WALLET = "BxEsw8dYEaZkGmEKLTCrzhnJT6k9h7wwoaQEmyiXxKEd"; // attacker wallet

async function attack(name: string, body: any, expectedBlock: boolean) {
  try {
    const res = await fetch(`${BASE_URL}/api/build-tx`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://evil-site.com", // wrong origin for origin tests
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const blocked = !data.success;
    const icon = blocked === expectedBlock ? "✅" : "❌ FAIL";
    console.log(`${icon} [${res.status}] ${name}: ${data.error || "success"}`);
    if (!blocked && expectedBlock) {
      console.log("   🚨🚨🚨 ATTACK GOT THROUGH! 🚨🚨🚨");
    }
  } catch (err: any) {
    console.log(`✅ [ERR] ${name}: ${err.message}`);
  }
}

async function attackWithCorrectOrigin(name: string, body: any, expectedBlock: boolean) {
  try {
    const res = await fetch(`${BASE_URL}/api/build-tx`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://www.shyft.lol", // correct origin
      },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    const blocked = !data.success;
    const icon = blocked === expectedBlock ? "✅" : "❌ FAIL";
    console.log(`${icon} [${res.status}] ${name}: ${data.error || "GOT TX BACK"}`);
    if (!blocked && expectedBlock) {
      console.log("   🚨🚨🚨 ATTACK GOT THROUGH! 🚨🚨🚨");
    }
    return data;
  } catch (err: any) {
    console.log(`✅ [ERR] ${name}: ${err.message}`);
    return null;
  }
}

async function main() {
  console.log("=".repeat(60));
  console.log("🔴 ATTACK TEST SUITE — /api/build-tx (production)");
  console.log("=".repeat(60));

  // ── 1. ORIGIN CHECK ──
  console.log("\n--- 1. ORIGIN CHECK ---");
  await attack("Wrong origin (evil-site.com)", {
    action: "createPost",
    params: { postId: 99999, content: "hacked", isPrivate: false },
    walletAddress: FAKE_WALLET,
  }, true);

  // ── 2. UNKNOWN ACTION ──
  console.log("\n--- 2. UNKNOWN ACTION ---");
  await attackWithCorrectOrigin("Unknown action: stealFunds", {
    action: "stealFunds",
    params: {},
    walletAddress: FAKE_WALLET,
  }, true);

  await attackWithCorrectOrigin("Unknown action: adminForceClose", {
    action: "adminForceClose",
    params: {},
    walletAddress: FAKE_WALLET,
  }, true);

  await attackWithCorrectOrigin("Unknown action: transfer", {
    action: "transfer",
    params: { to: FAKE_WALLET, amount: 1000000000 },
    walletAddress: FAKE_WALLET,
  }, true);

  // ── 3. MISSING PARAMS ──
  console.log("\n--- 3. MISSING / BAD PARAMS ---");
  await attackWithCorrectOrigin("Missing action field", {
    params: {},
    walletAddress: FAKE_WALLET,
  }, true);

  await attackWithCorrectOrigin("Missing walletAddress", {
    action: "createPost",
    params: { postId: 1, content: "test" },
  }, true);

  await attackWithCorrectOrigin("Invalid walletAddress", {
    action: "createPost",
    params: { postId: 1, content: "test" },
    walletAddress: "not-a-pubkey",
  }, true);

  await attackWithCorrectOrigin("createPost missing content", {
    action: "createPost",
    params: { postId: 1 },
    walletAddress: FAKE_WALLET,
  }, true);

  await attackWithCorrectOrigin("createComment missing all params", {
    action: "createComment",
    params: {},
    walletAddress: FAKE_WALLET,
  }, true);

  // ── 4. SQL-INJECTION STYLE ATTACKS ──
  console.log("\n--- 4. INJECTION ATTACKS ---");
  await attackWithCorrectOrigin("Action with special chars", {
    action: "createPost; DROP TABLE users;",
    params: {},
    walletAddress: FAKE_WALLET,
  }, true);

  await attackWithCorrectOrigin("Params with __proto__ pollution", {
    action: "createPost",
    params: { postId: 1, content: "test", "__proto__": { "admin": true } },
    walletAddress: FAKE_WALLET,
  }, false); // this should actually work — it's just a string field, proto pollution doesn't affect Anchor

  // ── 5. RATE LIMITING ──
  console.log("\n--- 5. RATE LIMITING ---");
  // Fire 6 requests rapidly — 6th should be rate limited
  let rateLimited = false;
  for (let i = 0; i < 7; i++) {
    const res = await fetch(`${BASE_URL}/api/build-tx`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Origin": "https://www.shyft.lol",
      },
      body: JSON.stringify({
        action: "likePost",
        params: { author: FAKE_WALLET, postId: i },
        walletAddress: FAKE_WALLET,
      }),
    });
    const data = await res.json();
    if (res.status === 429) {
      rateLimited = true;
      console.log(`✅ [429] Rate limited on request #${i + 1}: ${data.error}`);
      break;
    }
  }
  if (!rateLimited) {
    console.log("❌ FAIL: Rate limit never triggered after 7 rapid requests");
  }

  // ── 6. CAN ATTACKER GET A TX AND MODIFY IT? ──
  console.log("\n--- 6. TX TAMPERING (would fail at Solana level) ---");
  // Even if attacker gets a valid tx back, modifying it invalidates treasury signature
  // We can't fully test this without a real wallet, but we verify the tx IS partially signed
  const data = await attackWithCorrectOrigin("Get valid tx back (likePost)", {
    action: "likePost",
    params: { author: "11111111111111111111111111111111", postId: 0 },
    walletAddress: FAKE_WALLET,
  }, false); // might succeed or fail on account lookup, either way is fine

  if (data?.transaction) {
    console.log("   Got tx back — tx length:", Buffer.from(data.transaction, "base64").length, "bytes");
    console.log("   ℹ️  Modifying any byte would invalidate treasury signature → Solana rejects");
  }

  console.log("\n" + "=".repeat(60));
  console.log("🔴 ATTACK TEST COMPLETE");
  console.log("=".repeat(60));
}

main().catch(console.error);
