import React, { useEffect, useState } from 'react';
import Box from '@mui/material/Box';
import Slider from '@mui/material/Slider';
import { useSelector, useDispatch } from 'react-redux';
import { setEffectivePastDate, setEffectiveFutureDate } from '@/store/forecast-playground.store';
import Divider, { dividerClasses } from '@mui/material/Divider';
import { Typography } from '@mui/material';

export default function TimelineSliders() {
  const dispatch = useDispatch();

  const [pastMarks, setPastMarks] = useState([]);
  const [pastValue, setPastValue] = useState(null);

  const effectivePastDate = useSelector((state) => state.forecaster.effectivePastDate);
  const effectiveFutureDate = useSelector((state) => state.forecaster.effectiveFutureDate);
  const pastTimelineDates = useSelector((state) => state.forecaster.pastTimelineDates);
  const futureTimelineDates = useSelector((state) => state.forecaster.futureTimelineDates);

  // --- Generate slider marks ---
  useEffect(() => {
    if (!pastTimelineDates) return;

    const newPastMarks = pastTimelineDates
      .filter(item => item.date) // remove null/invalid
      .map(item => ({
        value: new Date(item.date).getTime(),
        label: item.name
      }));

    setPastMarks(newPastMarks);
  }, [pastTimelineDates]);

  // --- Sync Redux effective past date to slider value ---
  useEffect(() => {
    if (effectivePastDate && pastMarks.length > 0) {
      setPastValue(new Date(effectivePastDate).getTime());
    }
  }, [effectivePastDate, pastMarks]);

  // --- Handlers ---
  const handlePastDateChange = (event, newValue) => {
    const match = pastTimelineDates.find(item => new Date(item.date).getTime() === newValue);
    if (match) dispatch(setEffectivePastDate(match.date));
  };

  // --- Future slider: años continuos (0-10), hoy + N años directo a
  // effectiveFutureDate - ya no snapea a marcas fijas (3m/6m/1/2/5/10y).
  const [forecastYears, setForecastYears] = useState(1);

  useEffect(() => {
    if (!effectiveFutureDate) return;
    const diffMs = new Date(effectiveFutureDate).getTime() - Date.now();
    const years = Math.round(diffMs / (365.25 * 24 * 60 * 60 * 1000));
    setForecastYears(Math.min(10, Math.max(1, years || 1)));
  }, [effectiveFutureDate]);

  const handleForecastYearsChange = (event, years) => {
    setForecastYears(years);
    const futureDate = new Date();
    futureDate.setFullYear(futureDate.getFullYear() + years);
    dispatch(setEffectiveFutureDate(futureDate.toISOString()));
  };

  // --- Calculate min/max for past slider ---
  const minPast = pastMarks.length > 0 ? Math.min(...pastMarks.map(m => m.value)) : 0;
  const maxPast = pastMarks.length > 0 ? Math.max(...pastMarks.map(m => m.value)) : 100;

  if (!pastTimelineDates || !futureTimelineDates) return <div>Loading...</div>;

  const pastLabel = pastMarks.find(m => m.value === pastValue)?.label;
  const futureLabel = `${forecastYears} year${forecastYears === 1 ? '' : 's'}`;

  return (
    <div className='flex items-start'>
      <div>
        <h5 className='font-semibold text-xs'>Historical</h5>
        <Typography variant="body2" color="text.secondary">&larr;{pastLabel}</Typography>
      </div>
        <Box sx={{ width: '80%', height: 60, display: 'flex', justifyContent: 'center', alignItems: 'center' }}>
          {/* Past Slider */}
          <Slider
            value={pastValue}
            onChange={handlePastDateChange}
            step={null}
            marks={false}
            min={minPast}
            max={maxPast}
            track="inverted" 
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => {
              const mark = pastMarks.find(m => m.value === value);
              return mark ? mark.label : '';
            }}
            sx={{
              color: 'orange',
              width: '45%',
              '& .MuiSlider-mark': {
                width: 3,           // make it a thin vertical line
                height: 12,          // height of the dash
                backgroundColor: 'currentColor', // same color as slider
                borderRadius: 1,
              },
              '& .MuiSlider-markLabel': {
                display: 'none',
              },
              '& .MuiSlider-thumb': {
                width: 0,        // remove default thumb width
                height: 0,       // remove default thumb height
                bgcolor: 'transparent', // no background
                border: 'none',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 0,
                  height: 0,
                  borderTop: '10px solid transparent',
                  borderBottom: '10px solid transparent',
                  borderRight: '15px solid orange', // arrow color
                },
                '&:hover, &.Mui-focusVisible': {
                  boxShadow: 'none', // remove hover shadow
                }
              }
            }}
          />

          {/* Future Slider */}
          <Slider
            value={forecastYears}
            onChange={handleForecastYearsChange}
            min={0}
            max={10}
            step={1}
            marks={false}
            valueLabelDisplay="auto"
            valueLabelFormat={(value) => `${value}y`}
            sx={{
              color: 'blue',
              width: '45%',
              '& .MuiSlider-mark': {
                width: 3,
                height: 12,
                backgroundColor: 'currentColor',
                borderRadius: 1,
              },
              '& .MuiSlider-markLabel': {
                display: 'none',
              },
              '& .MuiSlider-thumb': {
                width: 0,        // remove default thumb width
                height: 0,       // remove default thumb height
                bgcolor: 'transparent', // no background
                border: 'none',
                '&::before': {
                  content: '""',
                  position: 'absolute',
                  top: '50%',
                  left: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: 0,
                  height: 0,
                  borderTop: '10px solid transparent',
                  borderBottom: '10px solid transparent',
                  borderLeft: '15px solid blue', // arrow color
                },
                '&:hover, &.Mui-focusVisible': {
                  boxShadow: 'none', // remove hover shadow
                }
              }
            }}
          />
        </Box>
        <div>
          <h5 className='font-semibold text-xs'>Forecast</h5>
          <Typography variant="body2" color="text.secondary">{futureLabel}&rarr;</Typography>
        </div>
    </div>
  );
}
