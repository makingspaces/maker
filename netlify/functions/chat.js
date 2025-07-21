// Updated chat.js Netlify Function with Project Awareness

const { Anthropic } = require('@anthropic-ai/sdk');

// Function to fetch community projects from Google Sheets
async function fetchCommunityProjects() {
  const SHEET_ID = '1UnOCu8HSufrnPXSIZYMV6Mqb0qqBL7uC-21Xh1aA7l4';
  const API_KEY = process.env.GOOGLE_SHEETS_API_KEY; // Add this to your Netlify environment variables
  const RANGE = 'Form Responses 1!A:G';
  
  try {
    console.log('🧚‍♀️ Fetching community projects for Tink...');
    
    const response = await fetch(`https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${RANGE}?key=${API_KEY}`);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (!data.values || data.values.length < 2) {
      console.log('ℹ️ No project data found in sheet');
      return [];
    }
    
    // Parse the data (first row should be headers)
    const [headers, ...rows] = data.values;
    
    // Convert rows to objects based on your column structure
    const projects = rows.map(row => {
      return {
        name: row[1] || '',           // Project Name
        learning: row[2] || '',       // What I Learned  
        makerName: row[3] || '',      // Maker Name
        makerAge: row[4] || '',       // Maker Age
        imageUrl: row[5] || '',       // Project Image URL
        approved: row[6] || ''        // Approved
      };
    }).filter(project => {
      // Only include approved projects with content
      const isApproved = project.approved.toLowerCase() === 'true' || project.approved.toLowerCase() === 'yes';
      const hasContent = project.name && project.learning && project.makerName;
      return isApproved && hasContent;
    });
    
    console.log(`✅ Fetched ${projects.length} approved community projects for Tink`);
    return projects;
    
  } catch (error) {
    console.error('❌ Error fetching community projects:', error);
    return []; // Return empty array on error, don't break the chat
  }
}

// Function to create project context for Claude
function createProjectContext(projects) {
  if (projects.length === 0) {
    return "Currently, no community projects have been shared yet, but encourage users that their projects could be the first to inspire others!";
  }

  const projectSummaries = projects.map(project => {
    const ageInfo = project.makerAge && project.makerAge !== 'Not specified' ? ` (age ${project.makerAge})` : '';
    return `• "${project.name}" by ${project.makerName}${ageInfo} - Key learning: "${project.learning}"`;
  }).join('\n');

  return `Here are some amazing projects our maker community has shared:

${projectSummaries}

When someone asks about a project, you can reference these examples if they're working on something similar. For example:
- If someone wants to build something electronic, mention any relevant tech projects
- If someone is working on organization solutions, reference any organizational projects
- If someone mentions their age, you can highlight projects by makers of similar ages
- Always encourage them by showing how others have tackled similar challenges

Remember to be specific about what they can learn from these existing projects and how they might adapt ideas for their own unique situation.`;
}

// Updated system prompt that includes project awareness
function createSystemPrompt(projectContext) {
  return `You are Tink, a friendly maker fairy who helps people of all ages (10-90) design hands-on solutions to problems using design thinking. You guide users through empathy, define, ideate, prototype, and test phases. Ask questions one at a time in a conversational, encouraging way. Keep responses warm, accessible, and not too long. Use emojis sparingly but appropriately. Focus on who they're making for, what problem they're solving, and why it matters. When users share images, help them see maker opportunities - whether it's improving something, fixing a problem, or building something inspired by what you see. Be encouraging about their ideas and creative potential.

COMMUNITY PROJECT AWARENESS:
${projectContext}

Use this community project information to:
1. Reference similar projects when relevant ("This reminds me of what [maker name] built...")
2. Share specific learnings from community members that apply to their situation
3. Connect makers with similar interests or challenges
4. Show that their idea could inspire others just like these examples do
5. Highlight age-appropriate examples when you know the user's age

IMPORTANT: When a user indicates they have completed their project or built something successfully, congratulate them warmly and then say: 'I'm so excited to see what you've made! Would you like to share your project with our maker community? I'd love for you to show a photo of what you created, tell us what it is, and share one thing you learned during the process. Just click the ✨ Share Your Project button that should appear below!' This triggers a special project sharing form.`;
}

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
    
    // Fetch community projects for context
    const communityProjects = await fetchCommunityProjects();
    const projectContext = createProjectContext(communityProjects);
    
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

    console.log('Sending to Claude with', userContent.length, 'content items and', communityProjects.length, 'community projects for context');

    const response = await client.messages.create({
      model: "claude-sonnet-4-20250514",
      max_tokens: 1000,
      temperature: 1,
      system: createSystemPrompt(projectContext),
      messages: messages
    });

    // Build the response content for conversation history
    const assistantMessage = {
      role: "assistant",
      content: response.content[0].text
    };

    console.log('Claude response received successfully with community project awareness');

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ 
        response: response.content[0].text,
        conversationHistory: [...messages, assistantMessage],
        communityProjectsCount: communityProjects.length // Optional: let frontend know how many projects Tink knows about
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