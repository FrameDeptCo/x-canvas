// Open X.com login window and grab session cookie
export function openLoginWindow() {
  return new Promise((resolve, reject) => {
    const width = 500;
    const height = 700;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    const loginUrl = 'https://x.com/i/flow/login';
    const popup = window.open(
      loginUrl,
      'x-login',
      `width=${width},height=${height},left=${left},top=${top}`
    );

    if (!popup) {
      reject(new Error('Failed to open login window. Please check popup blocker settings.'));
      return;
    }

    // Check periodically if the popup has completed login
    let checkCount = 0;
    const maxChecks = 120; // 2 minutes with 1s intervals

    const checkInterval = setInterval(() => {
      checkCount++;

      try {
        // Try to access popup's cookies via postMessage (if same origin after redirect)
        popup.postMessage({ type: 'getCookie' }, '*');
      } catch (e) {
        // Cross-origin, can't access directly
      }

      // Check if popup is closed
      if (popup.closed) {
        clearInterval(checkInterval);

        // Try to get cookie from localStorage or sessionStorage that the popup might have set
        const cookie = localStorage.getItem('x_session_cookie_temp') ||
                       sessionStorage.getItem('x_session_cookie_temp');

        if (cookie) {
          localStorage.removeItem('x_session_cookie_temp');
          sessionStorage.removeItem('x_session_cookie_temp');
          resolve({ success: true, cookie });
        } else {
          resolve({ success: false, cookie: null });
        }
      }

      // Timeout after 2 minutes
      if (checkCount >= maxChecks) {
        clearInterval(checkInterval);
        try {
          popup.close();
        } catch (e) {
          // Already closed
        }
        resolve({ success: false, cookie: null });
      }
    }, 1000);

    // Listen for messages from the popup
    window.addEventListener('message', (event) => {
      if (event.source === popup && event.data.type === 'cookieGrabbed') {
        clearInterval(checkInterval);
        try {
          popup.close();
        } catch (e) {
          // Already closed
        }
        resolve({ success: true, cookie: event.data.cookie });
      }
    });
  });
}
