import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { StatusPill } from './StatusPill';
import { useFlightStore } from '../../store/flightStore';

describe('StatusPill', () => {
  beforeEach(() => {
    useFlightStore.setState({
      activeFlight: null,
      isSyncingAirports: false,
      currentTelemetry: {
        ...useFlightStore.getState().currentTelemetry,
        simConnected: false,
        isInMenu: false,
      },
    });
  });

  it('renders Disconnected when simulator is not connected', () => {
    render(<StatusPill />);
    expect(screen.getByText('Disconnected')).toBeInTheDocument();
  });

  it('renders Connected when simulator is connected and idle', () => {
    useFlightStore.setState({
      currentTelemetry: {
        ...useFlightStore.getState().currentTelemetry,
        simConnected: true,
        isInMenu: false,
      },
    });
    render(<StatusPill />);
    expect(screen.getByText('Connected')).toBeInTheDocument();
  });

  it('renders Updating Navdata when airport sync is in progress', () => {
    useFlightStore.setState({ isSyncingAirports: true });
    render(<StatusPill />);
    expect(screen.getByText('Updating Navdata')).toBeInTheDocument();
  });
});
