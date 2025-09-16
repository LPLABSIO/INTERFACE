// Version simplifiée pour test
console.log('renderer-simple.js loaded');

// Test simple sans variable state
document.addEventListener('DOMContentLoaded', () => {
    console.log('DOM loaded in simple renderer');

    const scanBtn = document.getElementById('scan-devices');
    if (scanBtn) {
        console.log('Scan button found!');
        scanBtn.addEventListener('click', async () => {
            console.log('Scan button clicked!');
            scanBtn.disabled = true;
            scanBtn.textContent = 'Scanning...';

            try {
                console.log('Calling electronAPI.scanDevices()...');
                const devices = await window.electronAPI.scanDevices();
                console.log('Devices received:', devices);

                // Afficher le résultat dans la console
                if (devices && devices.length > 0) {
                    console.log(`Found ${devices.length} device(s):`, devices);
                    alert(`Found ${devices.length} device(s)! Check console for details.`);
                } else {
                    console.log('No devices found');
                    alert('No devices found');
                }
            } catch (error) {
                console.error('Error scanning:', error);
                alert(`Error: ${error.message}`);
            } finally {
                scanBtn.disabled = false;
                scanBtn.innerHTML = '<span class="icon">🔍</span> Scanner les appareils';
            }
        });
    } else {
        console.error('Scan button not found!');
    }
});