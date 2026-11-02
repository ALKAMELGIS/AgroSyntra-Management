import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, Alert,
} from '@mui/material';
import { CameraAlt, Close } from '@mui/icons-material';

function stopStream(stream) {
  stream?.getTracks?.().forEach((track) => track.stop());
}

export default function CameraCaptureDialog({ open, onClose, onCapture }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [error, setError] = useState('');
  const [ready, setReady] = useState(false);

  const startCamera = useCallback(async () => {
    setError('');
    setReady(false);
    if (!navigator.mediaDevices?.getUserMedia) {
      setError('Camera is not supported in this browser.');
      return;
    }
    try {
      stopStream(streamRef.current);
      let stream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' } },
          audio: false,
        });
      } catch {
        stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      }
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setReady(true);
    } catch (err) {
      setError(err.message || 'Could not access the camera. Check permissions and try again.');
    }
  }, []);

  useEffect(() => {
    if (open) {
      startCamera();
    } else {
      stopStream(streamRef.current);
      streamRef.current = null;
      setReady(false);
      setError('');
    }
    return () => stopStream(streamRef.current);
  }, [open, startCamera]);

  const handleCapture = () => {
    const video = videoRef.current;
    if (!video || !ready) return;
    const w = video.videoWidth;
    const h = video.videoHeight;
    if (!w || !h) return;

    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    canvas.getContext('2d')?.drawImage(video, 0, 0, w, h);
    canvas.toBlob(
      (blob) => {
        if (!blob) {
          setError('Failed to capture photo.');
          return;
        }
        const file = new File([blob], `scouting-${Date.now()}.jpg`, { type: 'image/jpeg' });
        onCapture(file);
        onClose();
      },
      'image/jpeg',
      0.92,
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
        <CameraAlt color="primary" />
        Take photo
      </DialogTitle>
      <DialogContent>
        {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}
        <Box
          sx={{
            position: 'relative',
            bgcolor: 'grey.900',
            borderRadius: 1,
            overflow: 'hidden',
            aspectRatio: '4 / 3',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {!ready && !error && (
            <Typography color="grey.400">Starting camera…</Typography>
          )}
          <video
            ref={videoRef}
            playsInline
            muted
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
              display: ready ? 'block' : 'none',
            }}
          />
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Position the subject in frame, then click Capture.
        </Typography>
      </DialogContent>
      <DialogActions sx={{ px: 3, pb: 2 }}>
        <Button onClick={onClose} startIcon={<Close />}>Cancel</Button>
        <Button variant="contained" onClick={handleCapture} disabled={!ready} startIcon={<CameraAlt />}>
          Capture
        </Button>
      </DialogActions>
    </Dialog>
  );
}
