import fetch from 'node-fetch';

const userAgent = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

export async function getSessionCookies(username, password) {
  try {
    console.log('Starting X.com login for:', username);

    // Get initial session with guest token
    const homeResponse = await fetch('https://x.com/', {
      headers: { 'User-Agent': userAgent }
    });

    const cookies = {};
    const setCookieHeaders = homeResponse.headers.raw()['set-cookie'] || [];

    setCookieHeaders.forEach(header => {
      const [nameValue] = header.split(';');
      const [name, value] = nameValue.split('=');
      cookies[name.trim()] = value.trim();
    });

    // Get guest token
    const guestResponse = await fetch('https://x.com/i/api/2/guest_activate', {
      method: 'POST',
      headers: {
        'User-Agent': userAgent,
        'Content-Type': 'application/json',
        'Cookie': Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
      }
    });

    if (!guestResponse.ok) throw new Error('Failed to get guest token');

    const guestData = await guestResponse.json();
    const guestToken = guestData.guest_token;

    console.log('Got guest token');

    // Initiate login flow
    const flowResponse = await fetch('https://x.com/i/api/2/oauth2/initiate_login_flow', {
      method: 'POST',
      headers: {
        'User-Agent': userAgent,
        'X-Guest-Token': guestToken,
        'Content-Type': 'application/json',
        'Cookie': Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
      },
      body: JSON.stringify({
        input_flow_data: { country_code: null }
      })
    });

    if (!flowResponse.ok) throw new Error('Failed to initiate login');

    const flowData = await flowResponse.json();
    console.log('Login flow initiated');

    // Submit credentials
    let currentFlowData = flowData;
    let attempts = 0;
    const maxAttempts = 5;

    while (attempts < maxAttempts) {
      attempts++;

      const nextTask = currentFlowData.data?.subtasks?.[0];
      if (!nextTask) break;

      let subtaskInputs = [];

      if (nextTask.subtask_id === 'LoginEnterUserIdentifierSSO' || nextTask.subtask_id === 'LoginEnterUserIdentifier') {
        subtaskInputs = [{
          subtask_id: nextTask.subtask_id,
          enter_text: { text: username }
        }];
      } else if (nextTask.subtask_id === 'LoginEnterPassword') {
        subtaskInputs = [{
          subtask_id: 'LoginEnterPassword',
          enter_password: { password }
        }];
      } else if (nextTask.subtask_id === 'AccountDuplicationCheck') {
        break;
      }

      if (subtaskInputs.length === 0) break;

      const nextResponse = await fetch('https://x.com/i/api/2/oauth2/next_link', {
        method: 'POST',
        headers: {
          'User-Agent': userAgent,
          'X-Guest-Token': guestToken,
          'Content-Type': 'application/json',
          'Cookie': Object.entries(cookies).map(([k, v]) => `${k}=${v}`).join('; ')
        },
        body: JSON.stringify({
          input_flow_data: currentFlowData.data.input_flow_data,
          subtask_inputs: subtaskInputs
        })
      });

      if (!nextResponse.ok) {
        const error = await nextResponse.text();
        throw new Error(`Flow step failed: ${error}`);
      }

      currentFlowData = await nextResponse.json();

      if (currentFlowData.data?.subtasks?.some(t => t.subtask_id === 'DenyLoginSubtask')) {
        throw new Error('Login denied by X.com');
      }

      // Extract any new cookies from response
      const newSetCookies = nextResponse.headers.raw()['set-cookie'] || [];
      newSetCookies.forEach(header => {
        const [nameValue] = header.split(';');
        const [name, value] = nameValue.split('=');
        cookies[name.trim()] = value.trim();
      });
    }

    console.log('Login flow completed');

    return {
      ct0: cookies.ct0 || '',
      auth_token: cookies.auth_token || ''
    };
  } catch (error) {
    console.error('Error during login:', error);
    throw new Error(`Login failed: ${error.message}`);
  }
}
