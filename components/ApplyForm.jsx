// Inside your component
const handleSubmit = async (e) => {
  e.preventDefault();
  
  try {
    // 1. Call the API route
    const response = await fetch('/api/apply', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ 
        fullName, email, phone, idNumber, program 
      })
    });

    const data = await response.json();

    if (!response.ok) {
      throw new Error(data.message || 'Failed to apply');
    }

    alert('Application Submitted Successfully!');
    // Optional: Trigger payment here if needed
    
  } catch (error) {
    console.error(error);
    alert(error.message);
  }
};