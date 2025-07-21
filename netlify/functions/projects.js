// netlify/functions/projects.js
exports.handler = async (event, context) => {
  // Handle CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers };
  }

  if (event.httpMethod !== 'GET') {
    return { 
      statusCode: 405, 
      headers,
      body: JSON.stringify({ error: 'Method Not Allowed' })
    };
  }

  try {
    // Get API key from environment variable
    const API_KEY = process.env.GOOGLE_SHEETS_API_KEY;
    const SHEET_ID = process.env.GOOGLE_SHEET_ID || '1UnOCu8HSufrnPXSIZYMV6Mqb0qqBL7uC-21Xh1aA7l4';
    
    if (!API_KEY) {
      console.error('Google Sheets API key not configured');
      return {
        statusCode: 500,
        headers,
        body: JSON.stringify({ error: 'API configuration error' })
      };
    }

    const RANGE = 'Form Responses 1!A:G';
    
    console.log('🧚‍♀️ Fetching community projects from Google Sheets...');
    
    const response = await fetch(
      `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${RANGE}?key=${API_KEY}`
    );
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const data = await response.json();
    console.log('📊 Raw Google Sheets data received');
    
    if (!data.values || data.values.length < 2) {
      console.log('ℹ️ No project data found in sheet');
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({ projects: [] })
      };
    }
    
    // Parse the data (first row should be headers)
    const [headers_row, ...rows] = data.values;
    console.log('📋 Headers:', headers_row);
    
    // Convert rows to objects - accounting for Timestamp column first
    const projects = rows.map(row => ({
      timestamp: row[0] || '',      // Timestamp
      name: row[1] || '',           // Project Name
      learning: row[2] || '',       // What I Learned  
      makerName: row[3] || '',      // Maker Name
      makerAge: row[4] || '',       // Maker Age
      imageUrl: row[5] || '',       // Project Image URL
      approved: row[6] || ''        // Approved
    })).filter(project => {
      // Only show approved projects with content
      const isApproved = project.approved.toLowerCase() === 'true' || 
                        project.approved.toLowerCase() === 'yes';
      const hasContent = project.name && project.learning && project.makerName;
      return isApproved && hasContent;
    });
    
    console.log(`✅ Returning ${projects.length} approved projects`);
    
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ projects })
    };
    
  } catch (error) {
    console.error('❌ Error loading community projects:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ 
        error: 'Failed to load projects',
        projects: [] 
      })
    };
  }
};