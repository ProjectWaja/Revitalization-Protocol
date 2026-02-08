/**
 * Revitalization Protocol — Milestone Types
 * Shared type definitions for the Construction Milestone Oracle
 */

export enum MilestoneStatus {
  NOT_STARTED = 0,
  IN_PROGRESS = 1,
  COMPLETED = 2,
  VERIFIED = 3,
  DISPUTED = 4,
}

export interface MilestoneClaimData {
  milestoneId: number           // uint8 milestone identifier within a project
  description: string           // Human-readable milestone description
  expectedProgress: number      // Expected completion percentage (0-100)
  claimDate: number             // Unix timestamp of claim submission
}

export interface SatelliteImageryData {
  imageUrl: string              // USGS/drone imagery URL
  captureDate: number           // Unix timestamp of image capture
  resolution: number            // Meters per pixel
  geoCoordinates: {
    lat: number
    lon: number
  }
  cloudCover: number            // Percentage cloud cover (0-100)
}

export interface PermitStatus {
  permitId: string              // Permit identifier
  status: string                // 'approved' | 'pending' | 'expired' | 'revoked'
  issuedDate: number            // Unix timestamp of permit issuance
  expiryDate: number            // Unix timestamp of permit expiry
  department: string            // Issuing department (building, electrical, etc.)
}

export interface MilestoneProgressScore {
  structuralProgress: number    // 0-100 from satellite/drone imagery analysis
  permitCompliance: number      // 0-100 from permit status checks
  imageVerification: number     // 0-100 from image quality & change detection
  overallProgress: number       // Weighted composite (0-100)
}

export interface AIMilestoneAssessment {
  progressNarrative: string     // Natural language progress summary
  verifiedPercentage: number    // AI-assessed completion percentage (0-100)
  concerns: string[]            // Identified risks or discrepancies
  recommendation: string        // Suggested action
  approved: boolean             // Whether AI recommends milestone approval
}

export interface OnchainMilestoneReport {
  projectId: string             // bytes32
  milestoneId: number           // uint8
  progressPercentage: number    // uint8 (0-100)
  verificationScore: number     // uint8 (0-100)
  approved: boolean             // bool
  timestamp: number             // uint64
}

export interface MilestoneReport {
  progressScore: MilestoneProgressScore
  aiAssessment: AIMilestoneAssessment
  satelliteData: SatelliteImageryData[]
  permitStatuses: PermitStatus[]
  reportHash: string            // Keccak256 hash for onchain verification
}
