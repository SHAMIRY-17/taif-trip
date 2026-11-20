
export async function onRequestGet() {
  return new Response(
    JSON.stringify({
      success: true,
      message: "Taif Trip API is ready"
    }),
    {
      headers: {
        "Content-Type": "application/json; charset=UTF-8"
      }
    }
  );
}

