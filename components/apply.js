const response = await fetch("/api/stkpush", {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({ phone: formattedPhone, fullName }),
});

const result = await response.json();

if (result.status === 'success') {
  // Show success message
} else {
  // Show the specific error message from the server
  alert("Error: " + (result.message || "Connection issue"));
}