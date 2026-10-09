# Recover full motifs from the original generated atlas and center their visible bounds.
Add-Type -AssemblyName System.Drawing
$iconDir = Join-Path $PSScriptRoot '../public/icons'
$sourcePath = Join-Path $iconDir 'woodland-atlas-source.png'
if (!(Test-Path -LiteralPath $sourcePath)) {
  Copy-Item -LiteralPath (Join-Path $iconDir 'woodland-atlas.png') -Destination $sourcePath
}
$source = [System.Drawing.Bitmap]::FromFile($sourcePath)
$names = 'axe oak pine sapling log planks chest coin worker hut map orders scroll settings sun moon star heart lock check close warning up right repeat sound muted save export import trash trophy saw water sprinkler fountain soil leaves acorn tent boots backpack book clock bolt gift crown tools handshake bread boat bear fish soup lantern market mouse hand flag dice search feather music mountain'.Split(' ')
# Empty horizontal gutters in the generated source, which was not a uniform grid.
$rows = @(0,178,338,490,640,800,943,1094,1254)
$size = 160
$atlas = [System.Drawing.Bitmap]::new(1280,1280)
$atlasGraphics = [System.Drawing.Graphics]::FromImage($atlas)
for ($row=0; $row -lt 8; $row++) {
  $occupied = New-Object bool[] $source.Width
  for ($x=0; $x -lt $source.Width; $x++) {
    for ($y=$rows[$row]; $y -lt $rows[$row+1]; $y++) {
      if ($source.GetPixel($x,$y).A -gt 80) { $occupied[$x]=$true; break }
    }
  }
  $columns = @(0)
  for ($col=1; $col -lt 8; $col++) {
    $expected = [int][Math]::Round($col*$source.Width/8)
    $best = -1; $distance = 1000
    for ($x=$expected-40; $x -le $expected+40; $x++) {
      if (!$occupied[$x] -and [Math]::Abs($x-$expected) -lt $distance) {
        $best=$x; $distance=[Math]::Abs($x-$expected)
      }
    }
    if ($best -lt 0) { throw "No gutter at row $row column $col" }
    $columns += $best
  }
  $columns += $source.Width
  for ($col=0; $col -lt 8; $col++) {
    $minX=$source.Width; $minY=$source.Height; $maxX=0; $maxY=0
    for ($x=$columns[$col]; $x -lt $columns[$col+1]; $x++) {
      for ($y=$rows[$row]; $y -lt $rows[$row+1]; $y++) {
        if ($source.GetPixel($x,$y).A -gt 80) {
          $minX=[Math]::Min($minX,$x); $minY=[Math]::Min($minY,$y)
          $maxX=[Math]::Max($maxX,$x); $maxY=[Math]::Max($maxY,$y)
        }
      }
    }
    $width=$maxX-$minX+1; $height=$maxY-$minY+1
    if ($width -gt 152 -or $height -gt 152) { throw "Unexpected motif bounds at $row,$col" }
    $tile=[System.Drawing.Bitmap]::new($size,$size)
    $g=[System.Drawing.Graphics]::FromImage($tile)
    # Integer translation only: retain the generated pixels and their original alpha.
    $dx=[int][Math]::Floor(($size-$width)/2)-2
    $dy=[int][Math]::Floor(($size-$height)/2)-2
    $dest=[System.Drawing.Rectangle]::new($dx,$dy,$width+4,$height+4)
    $g.DrawImage($source,$dest,$minX-2,$minY-2,$width+4,$height+4,[System.Drawing.GraphicsUnit]::Pixel)
    $g.Dispose()
    $tile.Save((Join-Path $iconDir ($names[$row*8+$col]+'.png')),[System.Drawing.Imaging.ImageFormat]::Png)
    $atlasGraphics.DrawImageUnscaled($tile,$col*$size,$row*$size)
    $tile.Dispose()
  }
}
$atlasGraphics.Dispose()
$atlas.Save((Join-Path $iconDir 'woodland-atlas.png'),[System.Drawing.Imaging.ImageFormat]::Png)
$atlas.Dispose(); $source.Dispose()
Write-Output 'Centered 64 complete icons and rebuilt the uniform atlas.'
