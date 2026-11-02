import { render, screen, waitFor } from '@testing-library/react';
import CropRecommendation from '../components/CropRecommendation';

jest.mock('../utils/api', () => ({
  apiRequest: jest.fn(),
}));

const { apiRequest } = require('../utils/api');

describe('CropRecommendation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('shows loading state initially', () => {
    apiRequest.mockReturnValue(new Promise(() => {}));
    render(<CropRecommendation fieldId="f1" />);
    expect(document.querySelector('.MuiCircularProgress-root, .MuiSkeleton-root')).toBeInTheDocument();
  });

  it('renders recommendations', async () => {
    apiRequest.mockResolvedValue([
      { crop_name: 'Tomato', crop_id: 'c1', score: 85, reasoning: ['Good EC range', 'Crop rotation benefit'] },
      { crop_name: 'Cucumber', crop_id: 'c2', score: 72, reasoning: ['Suitable pH levels'] },
    ]);

    render(<CropRecommendation fieldId="f1" />);

    await waitFor(() => {
      expect(screen.getByText('Tomato')).toBeInTheDocument();
      expect(screen.getByText('Cucumber')).toBeInTheDocument();
      expect(screen.getByText(/85/)).toBeInTheDocument();
    });
  });

  it('shows reasoning for each recommendation', async () => {
    apiRequest.mockResolvedValue([
      { crop_name: 'Pepper', crop_id: 'c3', score: 60, reasoning: ['Temperature suitable', 'Rotation recommended'] },
    ]);

    render(<CropRecommendation fieldId="f1" />);

    await waitFor(() => {
      expect(screen.getByText(/Temperature suitable/)).toBeInTheDocument();
    });
  });

  it('does not load when fieldId is missing', () => {
    render(<CropRecommendation fieldId={null} />);
    expect(apiRequest).not.toHaveBeenCalled();
  });

  it('handles API errors gracefully', async () => {
    apiRequest.mockRejectedValue(new Error('Server error'));
    render(<CropRecommendation fieldId="f1" />);

    await waitFor(() => {
      // Should not crash
      expect(document.querySelector('.MuiCircularProgress-root')).not.toBeInTheDocument();
    });
  });
});
