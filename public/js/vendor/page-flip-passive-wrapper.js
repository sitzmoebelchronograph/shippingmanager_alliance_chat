/**
 * PageFlip Passive Event Listener Wrapper
 *
 * This wrapper patches the native addEventListener to automatically
 * mark touchstart/touchmove events as passive, preventing the
 * browser warning about non-passive event listeners.
 */

(function() {
    const originalAddEventListener = EventTarget.prototype.addEventListener;

    EventTarget.prototype.addEventListener = function(type, listener, options) {
        // Only patch touch events for elements inside the calendar book
        if ((type === 'touchstart' || type === 'touchmove')) {
            // Check if this element is or is inside #calendarBook
            const isInCalendar = this.id === 'calendarBook' ||
                               (this.closest && this.closest('#calendarBook'));

            if (isInCalendar) {
                // If options is a boolean (useCapture), convert to object
                if (typeof options === 'boolean') {
                    options = { capture: options, passive: true };
                }
                // If options is an object, add passive
                else if (typeof options === 'object' && options !== null) {
                    options.passive = true;
                }
                // If options is undefined, create object
                else {
                    options = { passive: true };
                }
            }
        }

        return originalAddEventListener.call(this, type, listener, options);
    };
})();
