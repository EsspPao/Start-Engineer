Add-Type -AssemblyName System.Drawing

$root = Split-Path -Parent $PSScriptRoot
$build = Join-Path $root "build"
New-Item -ItemType Directory -Force -Path $build | Out-Null

function New-RoundedPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function New-StarEngineerPng([int]$size, [bool]$compact = $false) {
  $bitmap = [System.Drawing.Bitmap]::new($size, $size, [System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $graphics.Clear([System.Drawing.Color]::Transparent)

  $inset = if ($compact) { [Math]::Max(1, $size * .04) } else { $size * .045 }
  $radius = if ($compact) { $size * .24 } else { $size * .265 }
  $path = New-RoundedPath $inset $inset ($size - 2 * $inset) ($size - 2 * $inset) $radius
  $gradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new(0, 0),
    [System.Drawing.PointF]::new($size, $size),
    [System.Drawing.Color]::FromArgb(255, 80, 213, 239),
    [System.Drawing.Color]::FromArgb(255, 162, 88, 235)
  )
  $blend = [System.Drawing.Drawing2D.ColorBlend]::new(3)
  $blend.Colors = @(
    [System.Drawing.Color]::FromArgb(255, 80, 213, 239),
    [System.Drawing.Color]::FromArgb(255, 92, 109, 244),
    [System.Drawing.Color]::FromArgb(255, 162, 88, 235)
  )
  $blend.Positions = @(0.0, 0.52, 1.0)
  $gradient.InterpolationColors = $blend
  $graphics.FillPath($gradient, $path)

  if (-not $compact -and $size -ge 32) {
    $highlightPath = New-RoundedPath ($size * .075) ($size * .075) ($size * .85) ($size * .42) ($size * .21)
    $highlight = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(45, 255, 255, 255))
    $graphics.FillPath($highlight, $highlightPath)
    $highlight.Dispose()
    $highlightPath.Dispose()
  }

  $center = $size / 2.0
  $outer = if ($compact) { $size * .34 } else { $size * .29 }
  $inner = if ($compact) { $size * .095 } else { $size * .082 }
  $points = [System.Drawing.PointF[]]@(
    [System.Drawing.PointF]::new($center, $center - $outer),
    [System.Drawing.PointF]::new($center + $inner, $center - $inner),
    [System.Drawing.PointF]::new($center + $outer, $center),
    [System.Drawing.PointF]::new($center + $inner, $center + $inner),
    [System.Drawing.PointF]::new($center, $center + $outer),
    [System.Drawing.PointF]::new($center - $inner, $center + $inner),
    [System.Drawing.PointF]::new($center - $outer, $center),
    [System.Drawing.PointF]::new($center - $inner, $center - $inner)
  )
  $white = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::White)
  $graphics.FillPolygon($white, $points)

  $stream = [System.IO.MemoryStream]::new()
  $bitmap.Save($stream, [System.Drawing.Imaging.ImageFormat]::Png)
  $bytes = $stream.ToArray()
  $stream.Dispose(); $white.Dispose(); $gradient.Dispose(); $path.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
  return $bytes
}

$mainPng = New-StarEngineerPng 512
[System.IO.File]::WriteAllBytes((Join-Path $build "icon.png"), $mainPng)
[System.IO.File]::WriteAllBytes((Join-Path $build "tray-icon.png"), (New-StarEngineerPng 20 $true))

$sizes = @(16, 20, 24, 32, 40, 48, 64, 128, 256)
$images = [System.Collections.Generic.List[byte[]]]::new()
foreach ($size in $sizes) {
  $images.Add((New-StarEngineerPng $size ($size -le 24)))
}
$stream = [System.IO.MemoryStream]::new()
$writer = [System.IO.BinaryWriter]::new($stream)
$writer.Write([UInt16]0); $writer.Write([UInt16]1); $writer.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
for ($index = 0; $index -lt $sizes.Count; $index++) {
  $size = $sizes[$index]
  $dimension = if ($size -eq 256) { 0 } else { $size }
  $writer.Write([Byte]$dimension)
  $writer.Write([Byte]$dimension)
  $writer.Write([Byte]0); $writer.Write([Byte]0)
  $writer.Write([UInt16]1); $writer.Write([UInt16]32)
  $writer.Write([UInt32]$images[$index].Length); $writer.Write([UInt32]$offset)
  $offset += $images[$index].Length
}
foreach ($image in $images) { $writer.Write($image) }
$writer.Flush()
[System.IO.File]::WriteAllBytes((Join-Path $build "icon.ico"), $stream.ToArray())
$writer.Dispose(); $stream.Dispose()
