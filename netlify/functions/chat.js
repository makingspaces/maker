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
    
    console.log('Received request:', { 
      hasMessage: !!message, 
      hasImage: !!(image && image.data),
      messageLength: message ? message.length : 0 
    });
    
    const client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY,
    });

    // Build the user message content
    let userContent = [];
    
    // Handle image-only submissions
    if (image && image.data) {
      try {
        // Extract base64 data and media type
        const base64Data = image.data.includes(',') ? image.data.split(',')[1] : image.data;
        const mediaType = image.type || 'image/jpeg';
        
        console.log('Processing image:', { mediaType, dataLength: base64Data.length });
        
        userContent.push({
          type: "image",
          source: {
            type: "base64",
            media_type: mediaType,
            data: base64Data
          }
        });
        
        // Add text prompt for image analysis
        if (!message || message.trim() === '') {
          userContent.push({
            type: "text",
            text: "What do you see in this image? How can we turn this into a maker project or improve it using design thinking?"
          });
        } else {
          userContent.push({
            type: "text",
            text: message
          });
        }
      } catch (imageError) {
        console.error('Image processing error:', imageError);
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ 
            error: 'Failed to process image. Please try again with a different image format.' 
          })
        };
      }
    } else if (message && message.trim()) {
      // Text-only message
      userContent.push({
        type: "text",
        text: message
      });
    } else {
      // No content at all
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Please provide either a message or an image.' 
        })
      };
    }

    // Build messages array with conversation history
    const messages = [
      ...conversationHistory,
      { 
        role: "user", 
        content: userContent
      }
    ];

    console.log('Sending to Claude with', userContent.length, 'content items');

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      temperature: 1,
      system: "You are Tink, a friendly maker fairy who helps people of all ages (10-90) design hands-on solutions to problems using design thinking. You guide users through empathy, define, ideate, prototype, and test phases. Ask questions one at a time in a conversational, encouraging way. Keep responses warm, accessible, and not too long. Use emojis sparingly but appropriately. Focus on who they're making for, what problem they're solving, and why it matters.\n\nHowever, you should gauge the complexity and scope of the user's project to determine how deeply to apply the design thinking methodology. For straightforward, well-defined tasks (like hanging a picture, assembling furniture, or basic repairs), you can streamline your approach and focus on just the essential questions needed to help them succeed. For more complex, open-ended, or user-centered projects (like designing a new product, solving a community problem, or creating something innovative), apply the full design thinking process with more thorough exploration of each stage.",
      messages: messages
    });

    // Build the response content for conversation history
    const assistantMessage = {
      role: "assistant",
      content: response.content[0].text
    };

    console.log('Claude response received successfully');

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
    
    // More specific error handling
    if (error.status === 400) {
      return {
        statusCode: 400,
        headers,
        body: JSON.stringify({ 
          error: 'Image format not supported. Please try a different image (JPEG, PNG, or WebP).' 
        })
      };
    }
    
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Oops! Tink\'s magic is a bit tangled right now. Please try again! ✨' 
      })
    };
  }
};