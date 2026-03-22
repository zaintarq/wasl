import React from 'react';
import { View } from 'react-native';
import Svg, { Path } from 'react-native-svg';

const W = 32;
const H = 40;

/**
 * Girl character: blue dress, brown hair — illustrated full-body (no circle, no emoji look).
 */
export function CartoonGirlAvatar({ size = 32 }) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${W} ${H}`}>
        {/* Blue dress - simple A-line */}
        <Path
          fill="#4A90E2"
          stroke="#2E6BB5"
          strokeWidth="1"
          d="M 4 40 L 4 24 L 16 28 L 28 24 L 28 40 Z"
        />
        {/* Brown hair - flows from head down */}
        <Path
          fill="#8B6914"
          stroke="#6B4A10"
          strokeWidth="0.8"
          d="M 4 12 L 8 8 L 24 8 L 28 12 L 28 22 L 24 26 L 8 26 L 4 22 Z"
        />
        {/* Face - soft oval (no circle) */}
        <Path
          fill="#FFE4C4"
          stroke="#D4B896"
          strokeWidth="0.6"
          d="M 10 12 Q 16 6 22 12 Q 26 18 22 24 Q 16 28 10 24 Q 6 18 10 12 Z"
        />
        {/* Eyes - simple line eyes (character style) */}
        <Path fill="none" stroke="#333" strokeWidth="0.9" strokeLinecap="round" d="M 13 18 L 16 18 M 20 18 L 23 18" />
      </Svg>
    </View>
  );
}

/**
 * Boy character: blue shirt, short hair — illustrated full-body.
 */
export function CartoonBoyAvatar({ size = 32 }) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${W} ${H}`}>
        {/* Blue shirt */}
        <Path
          fill="#4A90D9"
          stroke="#2E6BB5"
          strokeWidth="1"
          d="M 6 40 L 6 22 L 14 26 L 18 22 L 22 26 L 26 22 L 26 40 Z"
        />
        {/* Short brown hair */}
        <Path
          fill="#8B6914"
          stroke="#6B4A10"
          strokeWidth="0.8"
          d="M 6 10 L 12 6 L 20 6 L 26 10 L 26 20 L 24 24 L 8 24 L 6 20 Z"
        />
        {/* Face - oval */}
        <Path
          fill="#FFE4C4"
          stroke="#D4B896"
          strokeWidth="0.6"
          d="M 10 12 Q 16 8 22 12 Q 26 18 20 24 Q 14 26 8 22 Q 6 16 10 12 Z"
        />
        <Path fill="none" stroke="#333" strokeWidth="0.9" strokeLinecap="round" d="M 13 17 L 16 17 M 20 17 L 23 17" />
      </Svg>
    </View>
  );
}

/**
 * Neutral character: yellow top — same style.
 */
export function CartoonPersonAvatar({ size = 32 }) {
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${W} ${H}`}>
        <Path fill="#E8C547" stroke="#C9A227" strokeWidth="1" d="M 6 40 L 6 24 L 26 24 L 26 40 Z" />
        <Path
          fill="#8B7355"
          stroke="#6B5344"
          strokeWidth="0.8"
          d="M 6 10 L 12 6 L 20 6 L 26 10 L 26 22 L 6 22 Z"
        />
        <Path
          fill="#FFE4C4"
          stroke="#D4B896"
          strokeWidth="0.6"
          d="M 10 12 Q 16 8 22 12 Q 26 18 20 24 Q 14 26 8 22 Q 6 16 10 12 Z"
        />
        <Path fill="none" stroke="#333" strokeWidth="0.9" strokeLinecap="round" d="M 13 17 L 16 17 M 20 17 L 23 17" />
      </Svg>
    </View>
  );
}
