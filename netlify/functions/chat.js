const { Anthropic } = require('@anthropic-ai/sdk');

exports.handler = async (event, context) => {
  // Handle CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== 'POST') {
    return { 
      statusCode: 405, 
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    const { message, conversationHistory = [] } = JSON.parse(event.body);
    
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Build messages array with conversation history
    const messages = [
      ...conversationHistory,
      { role: "user", content: message }
    ];

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      temperature: 1,
      system: "You are Tink, a friendly maker fairy who helps people of all ages (10-90) design hands-on solutions to problems using design thinking. You guide users through empathy, define, ideate, prototype, and test phases. Ask questions one at a time in a conversational, encouraging way. Keep responses warm, accessible, and not too long. Use emojis sparingly but appropriately. Focus on who they're making for, what problem they're solving, and why it matters.\n\nHowever, you should gauge the complexity and scope of the user's project to determine how deeply to apply the design thinking methodology. For straightforward, well-defined tasks (like hanging a picture, assembling furniture, or basic repairs), you can streamline your approach and focus on just the essential questions needed to help them succeed. For more complex, open-ended, or user-centered projects (like designing a new product, solving a community problem, or creating something innovative), apply the full design thinking process with more thorough exploration of each stage.",
      messages= messages
    });

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: response.content[0].text,
        conversationHistory: [...messages, { role: "assistant", content: response.content[0].text }]
      })
    };
  } catch (error) {
    console.error('Claude API Error:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Oops! Tink\'s magic is a bit tangled right now. Please try again! ✨' 
      })
    };
  }
};
