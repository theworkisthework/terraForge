; Sample G-code for terraForge tests
; Generated from a simple rectangle
G21 ; mm mode
G90 ; absolute positioning
G0 Z5 ; pen up
G0 X0 Y0 F3000 ; rapid to origin
M3 S0 ; pen up command
G0 X10 Y10 ; rapid to start
M3 S1 ; pen down command
G1 X90 Y10 F1000
G1 X90 Y90
G1 X10 Y90
G1 X10 Y10
M3 S0 ; pen up
G0 X50 Y50 ; rapid to center
M3 S1 ; pen down
G1 X60 Y50 F800
G2 X60 Y50 I-10 J0 ; full circle via arc
M3 S0 ; pen up
G0 X0 Y0 ; return home
M2 ; end program
