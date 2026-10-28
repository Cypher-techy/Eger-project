try {
  const response = await fetch("/api/stkpush", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone: formattedPhone, fullName }),
  });

  // Check if the response is actually OK
  if (!response.ok) {
    throw new Error(`HTTP error! status: ${response.status}`);
  }

  const result = await response.json();
  
  if (result.status === 'success') {
    alert("STK Push sent! Please check your phone.");
    // Handle success UI state
  } else {
    alert(`Server Error: ${result.message || 'Unknown error'}`);
  }

} catch (error) {
  console.error("Fetch Error:", error);
  alert(`Connection Issue: ${error.message}`);
}
