import { Volume2, Volume1, Volume, VolumeX } from "lucide-react";
import { Slider } from "../Slider/Slider";

interface VolumeControlProps {
    volume: number;
    onVolumeChange: (value: number) => void;
}

export const VolumeControl = ({ volume, onVolumeChange }: VolumeControlProps) => {
    const getVolumeIcon = () => {
        if (volume === 0) return <VolumeX size={18} opacity={0.5} />;
        if (volume < 0.3) return <Volume size={18} />;
        if (volume < 0.7) return <Volume1 size={18} />;
        return <Volume2 size={18} />;
    };

    return (
        <div className="volume-section">
            <span className="volume-icon">
                {getVolumeIcon()}
            </span>
            <Slider
                value={volume}
                min={0}
                max={1}
                step={0.01}
                onChange={onVolumeChange}
                formatTooltip={(val) => `${Math.round(val * 100)}%`}
                className="volume-slider-layout"
            />
        </div>
    );
};