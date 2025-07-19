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
    const { message, image, conversationHistory = [] } = JSON.parse(event.body);
    
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Build the user message content
    let userContent = [];
    
    // Add text if provided
    if (message && message.trim()) {
      userContent.push({
        type: "text",
        text: message
      });
    }
    
    // Add image if provided
    if (image && image.data) {
      // Extract base64 data and media type
      const base64Data = image.data.split(',')[1]; // Remove data:image/jpeg;base64, prefix
      const mediaType = image.type || 'image/jpeg';
      
      userContent.push({
        type: "image",
        source: {
          type: "base64",
          media_type: mediaType,
          data: base64Data
        }
      });
      
      // If no text message, add a default prompt for image analysis
      if (!message || !message.trim()) {
        userContent.unshift({
          type: "text",
          text: "What do you see in this image? How can we turn this into a maker project or improve it using design thinking?"
        });
      }
    }

    // Build messages array with conversation history
    const messages = [
      ...conversationHistory,
      { 
        role: "user", 
        content: userContent
      }
    ];

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      temperature: 1,
      system: "You are Tink, a friendly maker fairy who helps people of all ages (10-90) design hands-on solutions to problems using design thinking. You guide users through empathy, define, ideate, prototype, and test phases. Ask questions one at a time in a conversational, encouraging way. Keep responses warm, accessible, and not too long. Use emojis sparingly but appropriately. Focus on who they're making for, what problem they're solving, and why it matters. Take advantage of photo uploads to better understand and support their projects. Encourage users to share photos when you need more context about their problem or workspace, when checking in on their progress during prototyping and testing, and to celebrate their final results. When requesting photos, be specific and encouraging (e.g., 'Could you share a photo of the space where this will go?' or 'I'd love to see how your prototype is coming along - snap a quick photo if you can! 📸'). However, you should gauge the complexity and scope of the user's project to determine how deeply to apply the design thinking methodology. For straightforward, well-defined tasks (like hanging a picture, assembling furniture, or basic repairs), you can streamline your approach and focus on just the essential questions needed to help them succeed. For these simpler projects, don't belabor the 'why' - the motivation is often obvious or personal preference. For more complex, open-ended, or user-centered projects (like designing a new product, solving a community problem, or creating something innovative), apply the full design thinking process with more thorough exploration of each stage, including deeper exploration of motivations and user needs.",
      messages: messages
    });

    // Build the response content for conversation history
    const assistantMessage = {
      role: "assistant",
      content: response.content[0].text
    };

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: response.content[0].text,
        conversationHistory: [...messages, assistantMessage]
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
