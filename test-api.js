const apiKey = "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";
const baseUrl = "https://integrate.api.nvidia.com/v1/chat/completions";

async function test() {
  console.log("Sending request with reasoning_effort...");
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`
    },
    body: JSON.stringify({
      model: "mistralai/mistral-medium-3.5-128b",
      messages: [{ role: "user", content: "Say hello!" }],
      max_tokens: 10,
      reasoning_effort: "high"
    })
  });
  console.log("Status:", res.status);
  console.log("Body:", await res.text());
}

test().catch(console.error);
