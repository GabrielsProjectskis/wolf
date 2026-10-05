"""Sends WM_DELETE_WINDOW to the Wolf window: what a window manager does
when the user clicks the close button. Used by smoke.mjs."""
import sys
from Xlib import X, display, protocol

d = display.Display()
root = d.screen().root
WM_DELETE = d.intern_atom("WM_DELETE_WINDOW")
WM_PROTOCOLS = d.intern_atom("WM_PROTOCOLS")


def walk(win):
    try:
        name = win.get_wm_name()
        if name == sys.argv[1]:
            yield win
        for child in win.query_tree().children:
            yield from walk(child)
    except Exception:
        return


targets = list(walk(root))
for win in targets:
    event = protocol.event.ClientMessage(window=win, client_type=WM_PROTOCOLS, data=(32, [WM_DELETE, X.CurrentTime, 0, 0, 0]))
    win.send_event(event, event_mask=X.NoEventMask)
d.flush()
print(len(targets))
