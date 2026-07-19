export type GeometrySubject = "primary" | "neighbor" | "container" | "ancestor";

export interface DeltaInterval {
  readonly minimum: number;
  readonly maximum: number;
}

export type FlexDiagnostic =
  | { readonly code: "malformed_model"; readonly message: string }
  | { readonly code: "wrapped_layout"; readonly flexWrap: string; readonly message: string }
  | {
      readonly code: "nonzero_order";
      readonly domIndex: number;
      readonly order: number;
      readonly message: string;
    }
  | {
      readonly code: "transform_affected_geometry";
      readonly subject: GeometrySubject;
      readonly message: string;
    }
  | {
      readonly code: "zoom_affected_geometry";
      readonly subject: GeometrySubject;
      readonly message: string;
    }
  | {
      readonly code: "main_axis_auto_margin";
      readonly domIndex: number;
      readonly message: string;
    }
  | { readonly code: "out_of_flow_item"; readonly domIndex: number; readonly message: string }
  | {
      readonly code: "display_contents_item";
      readonly domIndex: number;
      readonly message: string;
    }
  | {
      readonly code: "invalid_box";
      readonly domIndex: number | null;
      readonly message: string;
    }
  | {
      readonly code: "zero_size_box";
      readonly domIndex: number | null;
      readonly message: string;
    }
  | { readonly code: "indefinite_container_main_size"; readonly message: string }
  | { readonly code: "missing_visual_neighbor"; readonly message: string }
  | { readonly code: "ambiguous_visual_neighbor"; readonly message: string }
  | { readonly code: "anonymous_flex_item"; readonly message: string }
  | {
      readonly code: "invalid_constraints";
      readonly member: "primary" | "neighbor" | null;
      readonly message: string;
    }
  | {
      readonly code: "min_max_clamp";
      readonly requestedDelta: number | null;
      readonly interval: DeltaInterval;
      readonly message: string;
    }
  | {
      readonly code: "intrinsic_validation_failed";
      readonly message: string;
    };

export type FlexRejected = {
  readonly ok: false;
  readonly diagnostic: FlexDiagnostic;
};
